import nodemailer from "nodemailer";

/**
 * Owner: Person 2 (Charles) - Subscription/Paywall.
 *
 * Sends the "welcome" email once a new account's one-time activation
 * payment succeeds (see subscription.service.js -> recordPaymentAndActivate).
 * Uses a generic SMTP transporter so any provider works (Gmail app
 * password, Mailtrap, Ethereal for local testing, SendGrid SMTP, etc.) -
 * see server/.env.example for the SMTP_* variables to set.
 *
 * Mirrors the Stripe test-mode pattern used elsewhere in this service: if
 * SMTP isn't configured, sending is skipped (logged, not thrown) so a
 * missing/broken mail setup never blocks the actual payment/activation
 * flow - the user already paid, the email is a nice-to-have on top.
 */

let cachedTransporter = null;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) return null;

  cachedTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });
  return cachedTransporter;
}

/**
 * HTML email body, styled to match the app's own dark-sidebar / blue-accent
 * look (client/src/theme.js design tokens: #0A1628 dark, #1A5C9E clickable,
 * #F4F7FC light bg, Inter font) so it feels like it came from this app.
 * Uses inline styles + table layout, since that's what actually renders
 * consistently across email clients (no external stylesheet support).
 */
function welcomeEmailHtml({ name }) {
  const appUrl = process.env.CLIENT_ORIGIN || "http://localhost:5173";
  const safeName = String(name).replace(/</g, "&lt;");

  return `<!doctype html>
<html>
  <body style="margin:0; padding:0; background:#f4f7fc; font-family:'Inter',Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fc; padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid rgba(10,22,40,0.12);">
            <tr>
              <td style="background:#0a1628; padding:28px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="width:36px; height:36px; background:#1a5c9e; border-radius:8px; text-align:center; vertical-align:middle; font-family:'Inter',Arial,sans-serif; font-weight:600; font-size:14px; color:#ffffff;">SS</td>
                    <td style="padding-left:10px; font-family:'Inter',Arial,sans-serif; font-weight:600; font-size:15px; color:#ffffff;">Stock Screener</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 32px;">
                <h1 style="margin:0 0 12px; font-family:'Inter',Arial,sans-serif; font-weight:600; font-size:22px; color:#0a1628;">Welcome, ${safeName}!</h1>
                <p style="margin:0 0 24px; font-family:'Inter',Arial,sans-serif; font-size:14px; line-height:1.6; color:rgba(10,22,40,0.75);">
                  Your payment went through and your Stock Screener account is now active.
                  You're all set to screen stocks by fundamentals, track dividends and
                  valuations, and build watchlists tailored to what matters to you.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background:#1a5c9e; border-radius:6px;">
                      <a href="${appUrl}" style="display:inline-block; padding:12px 24px; font-family:'Inter',Arial,sans-serif; font-weight:600; font-size:14px; color:#ffffff; text-decoration:none;">Go to Stock Screener</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px; border-top:1px solid rgba(10,22,40,0.12);">
                <p style="margin:0; font-family:'Inter',Arial,sans-serif; font-size:12px; color:rgba(10,22,40,0.5);">
                  You're receiving this because you just activated a Stock Screener account.
                  If this wasn't you, you can ignore this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * @param {{ to: string, name: string }} params
 */
export async function sendWelcomeEmail({ to, name }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn(`[mailer] SMTP not configured (see server/.env.example) - skipped welcome email to ${to}`);
    return { sent: false };
  }

  const appUrl = process.env.CLIENT_ORIGIN || "http://localhost:5173";

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || `"Stock Screener" <${process.env.SMTP_USER}>`,
      to,
      subject: `Welcome to Stock Screener, ${name}!`,
      html: welcomeEmailHtml({ name }),
      text: `Welcome, ${name}!\n\nYour Stock Screener account is now active. Visit ${appUrl} to get started.`,
    });
    return { sent: true };
  } catch (err) {
    console.error("[mailer] Failed to send welcome email:", err.message);
    return { sent: false, error: err.message };
  }
}

const OTP_EXPIRY_MINUTES = 10;

/**
 * HTML for the login 2FA code email - same branded shell as the welcome
 * email, with the 6-digit code as the focal point instead of a CTA button.
 */
function otpEmailHtml({ name, code }) {
  const safeName = String(name).replace(/</g, "&lt;");
  const safeCode = String(code).replace(/[^0-9]/g, "");

  return `<!doctype html>
<html>
  <body style="margin:0; padding:0; background:#f4f7fc; font-family:'Inter',Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fc; padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid rgba(10,22,40,0.12);">
            <tr>
              <td style="background:#0a1628; padding:28px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="width:36px; height:36px; background:#1a5c9e; border-radius:8px; text-align:center; vertical-align:middle; font-family:'Inter',Arial,sans-serif; font-weight:600; font-size:14px; color:#ffffff;">SS</td>
                    <td style="padding-left:10px; font-family:'Inter',Arial,sans-serif; font-weight:600; font-size:15px; color:#ffffff;">Stock Screener</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 32px;">
                <h1 style="margin:0 0 12px; font-family:'Inter',Arial,sans-serif; font-weight:600; font-size:22px; color:#0a1628;">Your verification code</h1>
                <p style="margin:0 0 24px; font-family:'Inter',Arial,sans-serif; font-size:14px; line-height:1.6; color:rgba(10,22,40,0.75);">
                  Hi ${safeName}, use this code to finish logging in to Stock Screener. It expires in ${OTP_EXPIRY_MINUTES} minutes.
                </p>
                <div style="margin:0 0 24px; padding:16px 24px; background:#f4f7fc; border-radius:8px; text-align:center; font-family:'Roboto Mono',monospace; font-weight:600; font-size:32px; letter-spacing:0.3em; color:#0a1628;">${safeCode}</div>
                <p style="margin:0; font-family:'Inter',Arial,sans-serif; font-size:12px; color:rgba(10,22,40,0.5);">
                  If you didn't try to log in, you can safely ignore this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Login 2FA (Person 1's auth flow, added by Person 2). Unlike
 * sendWelcomeEmail(), a missing SMTP setup here isn't just a nice-to-have -
 * login can't complete without the code reaching the user somehow. So when
 * SMTP isn't configured, this logs the raw code to the server console
 * instead of just warning, so local dev/testing can still proceed without
 * setting up a real mail provider. See server/.env.example.
 *
 * @param {{ to: string, name: string, code: string }} params
 */
export async function sendOtpEmail({ to, name, code }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn(
      `[mailer] SMTP not configured (see server/.env.example) - login code for ${to} is: ${code}`
    );
    return { sent: false };
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || `"Stock Screener" <${process.env.SMTP_USER}>`,
      to,
      subject: `Your Stock Screener verification code: ${code}`,
      html: otpEmailHtml({ name, code }),
      text: `Your Stock Screener verification code is ${code}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`,
    });
    return { sent: true };
  } catch (err) {
    console.error("[mailer] Failed to send login code email:", err.message);
    return { sent: false, error: err.message };
  }
}
