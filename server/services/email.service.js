// Transactional email service.
//
// One place that turns a typed intent (welcome, verify, reset, invoice, survey
// invite) into a branded, tenant-aware message and hands it to the mailer. Every
// sender is non-throwing and safe to fire-and-forget: if SMTP is not configured
// the mailer skips gracefully, so callers never need to guard. Numbers and text
// in templates come from the caller — never invented here.
//
// Consumers today: auth (welcome on user-create, reset notice on admin reset).
// Ready for A2 billing (sendInvoice), self-signup (sendEmailVerification) and
// engagement (sendSurveyInvite) to call without touching this file's internals.
const { sendMail, isConfigured } = require('../utils/mailer');
const env = require('../config/env');

const BRAND = { navy: '#012158', navy2: '#0a2c66', accent: '#168eff', ink: '#16233b', muted: '#67728a' };

// --------------------------------------------------------------------------- //
//  Small helpers
// --------------------------------------------------------------------------- //
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Pull branding/display from a tenant doc (or plain object), defensively.
function brandOf(tenant) {
  const b = (tenant && tenant.branding) || {};
  const company = b.companyName || (tenant && tenant.name) || 'Nexusora Workforce';
  return {
    company,
    logoUrl: b.logoUrl || b.logo || '',
    primary: b.primaryColor || BRAND.navy,
    subdomain: (tenant && tenant.subdomain) || '',
  };
}

// A tenant may front its own display name on the From header; the address still
// comes from MAIL_FROM (the authenticated SMTP sender).
function fromFor(tenant) {
  const { company } = brandOf(tenant);
  const m = String(env.MAIL_FROM).match(/<([^>]+)>/);
  const addr = m ? m[1] : env.MAIL_FROM;
  return addr ? `${company} <${addr}>` : env.MAIL_FROM;
}

function money(amount, currency) {
  const n = Number(amount);
  const v = Number.isFinite(n) ? n : 0;
  return `${currency ? currency + ' ' : ''}${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// --------------------------------------------------------------------------- //
//  Branded layout
// --------------------------------------------------------------------------- //
// A single inline-styled shell (email clients ignore <style>/external CSS).
// `bodyHtml` is the pre-built inner content; `preheader` is the hidden inbox
// preview line.
function layout({ tenant, title, bodyHtml, preheader }) {
  const br = brandOf(tenant);
  const logo = br.logoUrl
    ? `<img src="${esc(br.logoUrl)}" alt="${esc(br.company)}" height="40" style="display:block;margin:0 auto;max-height:40px">`
    : `<div style="font:700 20px Arial,sans-serif;color:#fff">${esc(br.company)}</div>`;
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#eef3fa;">
<span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden">${esc(preheader || title)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef3fa;padding:24px 12px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #dfe6f0">
      <tr><td style="background:linear-gradient(135deg,${BRAND.navy},${BRAND.navy2});padding:28px 32px;text-align:center">${logo}</td></tr>
      <tr><td style="padding:32px">
        <h1 style="margin:0 0 16px;font:700 20px Arial,sans-serif;color:${BRAND.navy}">${esc(title)}</h1>
        <div style="font:400 15px/1.6 Arial,sans-serif;color:${BRAND.ink}">${bodyHtml}</div>
      </td></tr>
      <tr><td style="padding:18px 32px;border-top:1px solid #eef2f8;font:400 12px/1.5 Arial,sans-serif;color:${BRAND.muted};text-align:center">
        ${esc(br.company)} · powered by Nexusora Technologies<br>
        This is an automated message — please do not reply.
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function button(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0"><tr>
    <td style="border-radius:10px;background:${BRAND.navy}">
      <a href="${esc(href)}" style="display:inline-block;padding:12px 26px;font:700 15px Arial,sans-serif;color:#ffffff;text-decoration:none;border-radius:10px">${esc(label)}</a>
    </td></tr></table>`;
}

function p(html) { return `<p style="margin:0 0 14px">${html}</p>`; }

// Build the login URL for a workspace. Subdomain-per-tenant URLs (D3) aren't
// live yet, so link to the app and carry the workspace as a query hint.
function loginUrl(tenant) {
  const sub = brandOf(tenant).subdomain;
  const base = env.APP_URL.replace(/\/+$/, '');
  return sub ? `${base}/login?workspace=${encodeURIComponent(sub)}` : `${base}/login`;
}

// --------------------------------------------------------------------------- //
//  Delivery with light retry
// --------------------------------------------------------------------------- //
async function deliver(type, tenant, msg) {
  if (!isConfigured()) return { skipped: true, reason: 'SMTP not configured', type };
  const payload = { from: fromFor(tenant), ...msg };
  let last = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await sendMail(payload);
    if (res.sent || res.skipped) return { ...res, type };
    last = res;
    if (attempt < 2) await new Promise((r) => setTimeout(r, 600));
  }
  return { ...(last || { error: 'unknown' }), type };
}

// --------------------------------------------------------------------------- //
//  Typed senders
// --------------------------------------------------------------------------- //

// New user provisioned by an admin. Includes the workspace and (optionally) a
// temporary password the user must change at first sign-in.
async function sendWelcome({ to, name, tenant, tempPassword }) {
  const br = brandOf(tenant);
  const url = loginUrl(tenant);
  const creds = tempPassword
    ? p(`Your temporary password is <b style="font-family:monospace;background:#f4f7fc;padding:2px 8px;border-radius:6px">${esc(tempPassword)}</b>. You'll be asked to change it the first time you sign in.`)
    : '';
  const body = [
    p(`Hi ${esc(name || 'there')},`),
    p(`An account has been created for you on <b>${esc(br.company)}</b>.`),
    br.subdomain ? p(`Workspace: <b>${esc(br.subdomain)}</b>${to ? ` · Email: <b>${esc(to)}</b>` : ''}`) : '',
    creds,
    button(url, 'Sign in'),
    p(`<span style="color:${BRAND.muted};font-size:13px">If the button doesn't work, open ${esc(url)}</span>`),
  ].join('');
  return deliver('welcome', tenant, {
    to, subject: `Welcome to ${br.company}`,
    html: layout({ tenant, title: `Welcome to ${br.company}`, bodyHtml: body, preheader: 'Your account is ready — sign in to get started.' }),
  });
}

// Email verification for self-serve signup (A2). `verifyUrl` is caller-built and
// already carries the token.
async function sendEmailVerification({ to, name, tenant, verifyUrl, expiresText }) {
  const body = [
    p(`Hi ${esc(name || 'there')},`),
    p(`Confirm this email address to activate your account.`),
    button(verifyUrl, 'Verify email'),
    expiresText ? p(`<span style="color:${BRAND.muted};font-size:13px">This link ${esc(expiresText)}.</span>`) : '',
    p(`<span style="color:${BRAND.muted};font-size:13px">If you didn't request this, you can ignore this message.</span>`),
  ].join('');
  return deliver('verify', tenant, {
    to, subject: `Verify your email`,
    html: layout({ tenant, title: 'Verify your email', bodyHtml: body, preheader: 'Confirm your email to activate your account.' }),
  });
}

// Password reset. Two shapes: a self-service reset link (`resetUrl`), or an
// admin-set temporary password (`tempPassword`, byAdmin=true).
async function sendPasswordReset({ to, name, tenant, resetUrl, tempPassword, byAdmin, expiresText }) {
  const url = loginUrl(tenant);
  let core;
  if (tempPassword) {
    core = [
      p(byAdmin
        ? `An administrator has reset the password on your <b>${esc(brandOf(tenant).company)}</b> account.`
        : `Your password has been reset.`),
      p(`Temporary password: <b style="font-family:monospace;background:#f4f7fc;padding:2px 8px;border-radius:6px">${esc(tempPassword)}</b>`),
      p(`For your security you'll be asked to change it at your next sign-in.`),
      button(url, 'Sign in'),
    ].join('');
  } else {
    core = [
      p(`We received a request to reset your password.`),
      button(resetUrl || url, 'Reset password'),
      expiresText ? p(`<span style="color:${BRAND.muted};font-size:13px">This link ${esc(expiresText)}.</span>`) : '',
      p(`<span style="color:${BRAND.muted};font-size:13px">If you didn't request this, no action is needed — your password stays the same.</span>`),
    ].join('');
  }
  const body = p(`Hi ${esc(name || 'there')},`) + core;
  return deliver('reset', tenant, {
    to, subject: `Password reset`,
    html: layout({ tenant, title: 'Password reset', bodyHtml: body, preheader: 'Details about your account password.' }),
  });
}

// Invoice / receipt for a subscription charge (A2 billing). `invoice`:
// { number, periodLabel, items:[{label, amount}], total, currency, status,
//   dueDate }. Optional `pdf` = { filename, content|path } attaches the receipt.
async function sendInvoice({ to, tenant, invoice = {}, pdf }) {
  const cur = invoice.currency || (tenant && tenant.baseCurrency) || '';
  const rows = (invoice.items || [])
    .map((it) => `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #eef2f8;font:400 14px Arial,sans-serif;color:${BRAND.ink}">${esc(it.label)}</td>
      <td style="padding:8px 0;border-bottom:1px solid #eef2f8;font:400 14px Arial,sans-serif;color:${BRAND.ink};text-align:right">${esc(money(it.amount, cur))}</td>
    </tr>`).join('');
  const paid = String(invoice.status || '').toLowerCase() === 'paid';
  const body = [
    p(`${paid ? 'Thank you — your payment has been received.' : 'A new invoice is available for your subscription.'}`),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 18px">
       <tr><td style="font:700 13px Arial,sans-serif;color:${BRAND.muted};padding-bottom:6px">INVOICE ${esc(invoice.number || '')}${invoice.periodLabel ? ` · ${esc(invoice.periodLabel)}` : ''}</td></tr>
     </table>
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
       ${rows}
       <tr>
         <td style="padding:12px 0 0;font:700 15px Arial,sans-serif;color:${BRAND.navy}">Total${paid ? ' paid' : ' due'}</td>
         <td style="padding:12px 0 0;font:700 15px Arial,sans-serif;color:${BRAND.navy};text-align:right">${esc(money(invoice.total, cur))}</td>
       </tr>
     </table>`,
    invoice.dueDate && !paid ? p(`<span style="color:${BRAND.muted};font-size:13px">Due ${esc(invoice.dueDate)}.</span>`) : '',
  ].join('');
  const attachments = pdf ? [{ filename: pdf.filename || `invoice-${invoice.number || 'receipt'}.pdf`, content: pdf.content, path: pdf.path }] : undefined;
  return deliver('invoice', tenant, {
    to, subject: `${paid ? 'Receipt' : 'Invoice'} ${invoice.number || ''}`.trim(),
    html: layout({ tenant, title: paid ? 'Payment receipt' : 'Invoice', bodyHtml: body, preheader: paid ? 'Your payment receipt.' : 'Your subscription invoice.' }),
    attachments,
  });
}

// Survey/pulse invitation (engagement B1). `surveyUrl` is caller-built (may be a
// tokenised per-recipient link).
async function sendSurveyInvite({ to, name, tenant, surveyTitle, surveyUrl, closesText }) {
  const body = [
    p(`Hi ${esc(name || 'there')},`),
    p(`You're invited to take part in <b>${esc(surveyTitle || 'a short survey')}</b>. It takes just a few minutes and your responses are confidential.`),
    button(surveyUrl, 'Take the survey'),
    closesText ? p(`<span style="color:${BRAND.muted};font-size:13px">${esc(closesText)}.</span>`) : '',
  ].join('');
  return deliver('survey', tenant, {
    to, subject: surveyTitle ? `You're invited: ${surveyTitle}` : `You're invited to a survey`,
    html: layout({ tenant, title: surveyTitle || 'Survey invitation', bodyHtml: body, preheader: 'Share your feedback — it only takes a few minutes.' }),
  });
}

module.exports = {
  isConfigured,
  sendWelcome,
  sendEmailVerification,
  sendPasswordReset,
  sendInvoice,
  sendSurveyInvite,
  // exported for tests / previews
  _internal: { layout, brandOf, fromFor, money, loginUrl },
};
