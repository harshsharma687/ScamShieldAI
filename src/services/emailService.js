/**
 * Transactional email for password resets and email-change verification.
 *
 * If SMTP is not configured the API returns a clear 503 instead of pretending
 * an email was sent. Tokens are never logged and never returned in API output.
 */
const nodemailer = require("nodemailer");
const env = require("../config/env");
const AppError = require("../utils/AppError");

let transporter = null;

function isEmailConfigured() {
  return env.email.isConfigured;
}

function getTransporter() {
  if (!isEmailConfigured()) {
    throw new AppError(
      "Email delivery is not configured on this server. Set SMTP_HOST and related variables.",
      503,
      { code: "EMAIL_NOT_CONFIGURED" }
    );
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.email.host,
      port: env.email.port,
      secure: env.email.secure,
      auth:
        env.email.user && env.email.pass
          ? { user: env.email.user, pass: env.email.pass }
          : undefined,
    });
  }

  return transporter;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function frontendUrl(pathname, token) {
  const base = (env.frontendOrigins[0] || "http://localhost:5173").replace(/\/$/, "");
  return `${base}/${pathname.replace(/^\//, "")}?token=${encodeURIComponent(token)}`;
}

async function sendMail({ to, subject, text, html }) {
  return getTransporter().sendMail({
    from: env.email.from,
    to,
    subject,
    text,
    html,
  });
}

async function sendPasswordResetEmail({ to, name, token }) {
  const link = frontendUrl("reset-password", token);
  const safeName = escapeHtml(name || "there");

  return sendMail({
    to,
    subject: "Reset your ScamShield AI password",
    text: `Hello ${name || "there"},\n\nUse this link within 1 hour to reset your password:\n${link}\n\nIf you did not request this, ignore this email.\n\nScamShield AI`,
    html: `
      <p>Hello ${safeName},</p>
      <p>Use the link below within 1 hour to reset your ScamShield AI password.</p>
      <p><a href="${escapeHtml(link)}">Reset password</a></p>
      <p>If you did not request this, you can ignore this email. Your password will not change.</p>
      <p>— ScamShield AI</p>
    `,
  });
}

async function sendEmailChangeVerification({ to, name, token }) {
  const link = frontendUrl("verify-email", token);
  const safeName = escapeHtml(name || "there");

  return sendMail({
    to,
    subject: "Confirm your new ScamShield AI email address",
    text: `Hello ${name || "there"},\n\nConfirm your new email address within 1 hour:\n${link}\n\nIf you did not request this, ignore this email.\n\nScamShield AI`,
    html: `
      <p>Hello ${safeName},</p>
      <p>Confirm this address as the new email for your ScamShield AI account. The link expires in 1 hour.</p>
      <p><a href="${escapeHtml(link)}">Confirm new email</a></p>
      <p>If you did not request this, ignore this email. Your current email stays active.</p>
      <p>— ScamShield AI</p>
    `,
  });
}

async function sendPasswordChangedNotice({ to, name }) {
  const safeName = escapeHtml(name || "there");

  return sendMail({
    to,
    subject: "Your ScamShield AI password was changed",
    text: `Hello ${name || "there"},\n\nYour password was changed and all other sessions were signed out. If this was not you, reset your password immediately.\n\nScamShield AI`,
    html: `
      <p>Hello ${safeName},</p>
      <p>Your ScamShield AI password was changed and all refresh sessions were revoked.</p>
      <p>If this was not you, reset your password immediately.</p>
      <p>— ScamShield AI</p>
    `,
  });
}

module.exports = {
  isEmailConfigured,
  sendPasswordResetEmail,
  sendEmailChangeVerification,
  sendPasswordChangedNotice,
};
