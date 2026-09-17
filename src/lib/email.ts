import nodemailer from "nodemailer";

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  }
  return transporter;
}

/**
 * Sends via Haseeb's own Gmail over SMTP, authenticated with a Google
 * "App Password" (a separate, revocable 16-character code — not his real
 * account password) rather than a third-party email service. A no-op
 * until GMAIL_USER/GMAIL_APP_PASSWORD are configured, matching how this
 * app already treats the notify* stubs in pending-changes.ts — failing to
 * send an email should never block the action that triggered it (approving
 * someone shouldn't fail just because a reminder couldn't go out), so this
 * only logs and returns false rather than throwing.
 */
export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const transport = getTransporter();
  const from = process.env.GMAIL_USER;
  if (!transport || !from) {
    console.warn(`[email] Not configured — would have sent "${subject}" to ${to}`);
    return false;
  }

  try {
    await transport.sendMail({ from: `Nams Family Tree <${from}>`, to, subject, html });
    return true;
  } catch (err) {
    console.error("[email] send failed:", err);
    return false;
  }
}

/**
 * Wraps plain body text in a minimal, readable HTML shell — one <p> per
 * blank-line-separated paragraph, except a run of consecutive "- " lines,
 * which becomes a real <ul> instead (so a compose box can produce a
 * bulleted list without needing an HTML editor).
 */
export function emailBodyToHtml(body: string): string {
  const blocks = body
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n").map((l) => l.trim());
      if (lines.every((l) => l.startsWith("- "))) {
        const items = lines.map((l) => `<li style="margin:0 0 0.4em 0;">${l.slice(2)}</li>`).join("");
        return `<ul style="margin:0 0 1em 0; padding-left:1.25em;">${items}</ul>`;
      }
      return `<p style="margin:0 0 1em 0;">${block.replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.5;color:#1e293b;max-width:480px;margin:0 auto;">
      ${blocks}
    </div>
  `;
}
