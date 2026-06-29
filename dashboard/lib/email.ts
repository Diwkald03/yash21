/**
 * Email sender — Gmail SMTP via nodemailer.
 *
 * Configure in .env.local:
 *   GMAIL_USER=you@gmail.com
 *   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx   (Gmail → Manage account → Security →
 *                                            2-Step Verification → App passwords)
 *
 * If not configured, sending is skipped and the caller receives the code back so the
 * flow is fully testable in development without a mailbox.
 */
import nodemailer from "nodemailer";

export function emailConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

export async function sendResetCode(to: string, code: string): Promise<{ sent: boolean }> {
  if (!emailConfigured()) {
    console.log(`[email] (dev) password reset code for ${to}: ${code}`);
    return { sent: false };
  }
  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
  await transport.sendMail({
    from: `DeoDap Notebook <${process.env.GMAIL_USER}>`,
    to,
    subject: "Your DeoDap password reset code",
    text: `Your password reset code is ${code}. It expires in 15 minutes.`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:440px;margin:auto">
        <h2 style="color:#0d9488">DeoDap Notebook</h2>
        <p>Use this code to reset your password. It expires in 15 minutes.</p>
        <div style="font-size:30px;font-weight:800;letter-spacing:6px;background:#f1f5f9;
                    border-radius:10px;padding:16px;text-align:center;color:#0f172a">${code}</div>
        <p style="color:#64748b;font-size:13px">If you didn't request this, you can ignore this email.</p>
      </div>`,
  });
  return { sent: true };
}
