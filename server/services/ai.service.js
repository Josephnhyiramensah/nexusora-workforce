// server/services/ai.service.js
// Provider-swappable LLM client. Anthropic (Claude) by default. Reads its key and model
// from the environment so no secret ever lives in code:
//   ANTHROPIC_API_KEY   (required)   — your Anthropic API key
//   AI_MODEL            (optional)   — model id, e.g. a current Claude model. Defaults below.
//   AI_PROVIDER         (optional)   — 'anthropic' (default). Structure allows adding others.
//
// The rest of the app calls complete()/completeJSON() and never talks to a provider directly,
// so switching providers later is a one-file change.

// DNS ordering is left at Node's default (verbatim) so it uses whichever address family
// actually works on this network. Only override if you KNOW you need to, via AI_DNS_ORDER
// = 'ipv4first' | 'ipv6first' | 'verbatim'. (Forcing a family that is blocked causes a
// ~12s connect timeout — so do not set this unless a specific network requires it.)
try { if (process.env.AI_DNS_ORDER) require('node:dns').setDefaultResultOrder(process.env.AI_DNS_ORDER); } catch { /* ignore */ }

const PROVIDER = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
// Default model. Override with AI_MODEL in the server env. Model ids change over time —
// if this returns 404, set AI_MODEL to a current id from your Anthropic account.
const MODEL = process.env.AI_MODEL || 'claude-sonnet-5';
const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 60000);

function isConfigured() {
  if (PROVIDER === 'anthropic') return !!process.env.ANTHROPIC_API_KEY;
  return false;
}

function notConfigured() {
  const e = new Error('AI is not configured on the server. Set ANTHROPIC_API_KEY (and optionally AI_MODEL) in the server environment.');
  e.status = 503; return e;
}

// Low-level: send a system prompt + message list, return the assistant text.
async function complete({ system, messages, maxTokens = 1600, temperature }) {
  if (!isConfigured()) throw notConfigured();
  if (PROVIDER === 'anthropic') return anthropicComplete({ system, messages, maxTokens, temperature });
  const e = new Error(`AI provider "${PROVIDER}" is not implemented.`); e.status = 501; throw e;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function anthropicComplete({ system, messages, maxTokens, temperature }) {
  // Base request. `temperature` is only sent when AI_SEND_TEMPERATURE=true, because newer
  // reasoning models (Opus 5 / 4.8, Sonnet 5) use adaptive thinking and reject a custom
  // temperature with a 400. Leaving it off uses the model's default and works everywhere.
  const body = { model: MODEL, max_tokens: maxTokens, system, messages };
  if (String(process.env.AI_SEND_TEMPERATURE || '').toLowerCase() === 'true' && temperature != null) {
    body.temperature = temperature;
  }

  const MAX_ATTEMPTS = 3;
  let lastNetErr = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!resp.ok) {
        // Surface the API's own explanation. 4xx are not retried (the request itself is wrong);
        // 429/5xx are transient and get one more try.
        let apiMsg = '';
        try { const j = await resp.json(); apiMsg = j?.error?.message || j?.message || ''; }
        catch { try { apiMsg = (await resp.text()).slice(0, 300); } catch { /* */ } }
        const retryableStatus = resp.status === 429 || resp.status >= 500;
        if (retryableStatus && attempt < MAX_ATTEMPTS) { await sleep(500 * attempt); continue; }
        const hint = resp.status === 401 ? ' Check ANTHROPIC_API_KEY.'
          : resp.status === 404 ? ' Check AI_MODEL — the model id may be wrong for your account.'
            : '';
        const e = new Error(`AI request failed (${resp.status})${apiMsg ? ': ' + apiMsg : ''}.${hint}`);
        e.status = 502; e.detail = apiMsg; throw e;
      }
      const data = await resp.json();
      // Newer models can interleave thinking blocks; keep only text output.
      return (data.content || []).filter((b) => b.type === 'text' || b.text).map((b) => b.text || '').join('').trim();
    } catch (err) {
      // An error we already shaped (has .status) is a real API error — don't retry it.
      if (err.status) throw err;
      // Otherwise it's a network/abort error. Retry transient connect failures.
      const cause = err && err.cause;
      const raw = (cause && (cause.code || cause.name)) || (cause && cause.message) || err.name || err.message || 'network error';
      const transient = err.name === 'AbortError' || /ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|UND_ERR_SOCKET/i.test(raw);
      lastNetErr = raw;
      if (transient && attempt < MAX_ATTEMPTS) { await sleep(500 * attempt); continue; }
      let hint = '';
      if (/ENOTFOUND|EAI_AGAIN/i.test(raw)) hint = ' DNS could not resolve api.anthropic.com — the server has no working internet/DNS.';
      else if (/ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|ECONNREFUSED|ECONNRESET|AbortError/i.test(raw)) hint = ' The connection kept timing out. If a standalone `node -e fetch(...)` works but the server does not, try setting AI_DNS_ORDER=ipv6first (or ipv4first) in the server env to force the working route.';
      else if (/certificate|self.signed|CERT|TLS|SSL/i.test(raw)) hint = ' A TLS/certificate error — antivirus or a corporate proxy may be intercepting HTTPS.';
      const e = new Error(`Could not reach the AI service (${raw}).${hint}`);
      e.status = 502; throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  const e = new Error(`Could not reach the AI service (${lastNetErr || 'network error'}).`); e.status = 502; throw e;
}

// Pull the first JSON object/array out of a model reply, tolerating ```json fences and prose.
function extractJSON(text) {
  if (!text) throw new Error('Empty AI response.');
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  // find the outermost JSON bracket pair
  const firstObj = t.indexOf('{'); const firstArr = t.indexOf('[');
  let start = -1;
  if (firstObj === -1) start = firstArr; else if (firstArr === -1) start = firstObj; else start = Math.min(firstObj, firstArr);
  if (start === -1) throw new Error('No JSON found in AI response.');
  const stack = []; let end = -1, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') { stack.pop(); if (stack.length === 0) { end = i; break; } }
  }
  if (end !== -1) return JSON.parse(t.slice(start, end + 1));
  // Truncated reply (ran out of tokens): salvage by closing what's still open.
  let repaired = t.slice(start);
  if (inStr) repaired += '"';
  repaired = repaired.replace(/,\s*$/, '');            // drop a dangling comma
  for (let i = stack.length - 1; i >= 0; i--) repaired += stack[i] === '{' ? '}' : ']';
  try { return JSON.parse(repaired); } catch { throw new Error('Malformed JSON in AI response.'); }
}

// Convenience: ask for JSON and parse it. Gives a generous token budget so the object never
// truncates, and the parser tolerates any preamble/fences and repairs a cut-off reply.
async function completeJSON(opts) {
  const text = await complete({ ...opts, maxTokens: opts.maxTokens ?? 4000 });
  return extractJSON(text);
}

module.exports = { complete, completeJSON, extractJSON, isConfigured, MODEL, PROVIDER };