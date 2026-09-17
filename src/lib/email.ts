import { Resend } from "resend";

/**
 * A no-op until RESEND_API_KEY/RESEND_FROM_EMAIL are configured, matching
 * how this app already treats the notify* stubs in pending-changes.ts —
 * failing to send an email should never block the action that triggered
 * it (approving someone shouldn't fail just because a reminder couldn't
 * go out), so this only logs and returns false rather than throwing.
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
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    console.warn(`[email] Not configured — would have sent "${subject}" to ${to}`);
    return false;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({ from, to, subject, html });
  if (error) {
    console.error("[email] send failed:", error);
    return false;
  }
  return true;
}

/** Wraps plain body text (one <p> per blank-line-separated paragraph) in a minimal, readable HTML shell. */
export function emailBodyToHtml(body: string): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 1em 0;">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.5;color:#1e293b;max-width:480px;margin:0 auto;">
      ${paragraphs}
    </div>
  `;
}
