// Thin email helper over nodemailer. Email is OPTIONAL: if SMTP is not
// configured (no SMTP_HOST), sendMail() resolves with { skipped: true } and
// logs nothing noisy, so the app runs fine with in-app notifications only.
// Configure in production by setting SMTP_HOST/PORT/USER/PASS and MAIL_FROM.
const nodemailer = require('nodemailer');
const env = require('../config/env');

let _transport = null;
let _verified = false;

const isConfigured = () => Boolean(env.SMTP_HOST);

function transport() {
  if (_transport) return _transport;
  if (!isConfigured()) return null;
  _transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE, // true for 465, false for 587/STARTTLS
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return _transport;
}

// sendMail({ to, subject, html, text }). `to` may be a string or string[].
// Never throws — returns { sent } / { skipped } / { error } so callers (like a
// background sweep) can continue regardless.
async function sendMail({ to, subject, html, text }) {
  const t = transport();
  if (!t) return { skipped: true, reason: 'SMTP not configured' };
  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
  if (!recipients.length) return { skipped: true, reason: 'no recipients' };
  try {
    if (!_verified) { await t.verify().catch(() => {}); _verified = true; }
    const info = await t.sendMail({
      from: env.MAIL_FROM,
      to: recipients.join(', '),
      subject,
      text: text || (html ? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : ''),
      html,
    });
    return { sent: true, messageId: info.messageId, accepted: info.accepted };
  } catch (e) {
    console.error('[mailer] send failed:', e.message);
    return { error: e.message };
  }
}

module.exports = { sendMail, isConfigured };
