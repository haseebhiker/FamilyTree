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

/** Turns a plain "https://..." URL in already-assembled text into a clickable, visibly-full-URL link — the point being that the actual address stays readable even if a client strips the hyperlink. */
function linkifyUrls(text: string): string {
  return text.replace(/(https?:\/\/[^\s<]+)/g, (url) => `<a href="${url}" style="color:#1d4ed8;">${url}</a>`);
}

/**
 * Wraps plain body text in a minimal, readable HTML shell — plain lines
 * become one <p> (joined by <br>), and any run of "- " lines becomes a
 * real <ul>, line by line rather than requiring a whole blank-line-
 * separated block to be entirely bullets. That per-block version missed
 * exactly the shape this app's own templates use — an intro line
 * ("A few things you can do:") directly followed by "- " lines with no
 * blank line before the list — so the intro line made the whole thing
 * fail the "every line is a bullet" check and all of it, dashes
 * included, fell back to one plain paragraph. Any plain URL becomes a
 * clickable link, with the full address still shown as the link text.
 */
export function emailBodyToHtml(body: string): string {
  const htmlBlocks: string[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    htmlBlocks.push(`<p style="margin:0 0 1em 0;">${linkifyUrls(paragraphLines.join("<br>"))}</p>`);
    paragraphLines = [];
  };
  const flushList = () => {
    if (listItems.length === 0) return;
    const items = listItems.map((l) => `<li style="margin:0 0 0.4em 0;">${linkifyUrls(l)}</li>`).join("");
    htmlBlocks.push(`<ul style="margin:0 0 1em 0; padding-left:1.25em;">${items}</ul>`);
    listItems = [];
  };

  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (line === "") {
      flushParagraph();
      flushList();
    } else if (line.startsWith("- ")) {
      flushParagraph();
      listItems.push(line.slice(2));
    } else {
      flushList();
      paragraphLines.push(line);
    }
  }
  flushParagraph();
  flushList();

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.5;color:#1e293b;max-width:480px;margin:0 auto;">
      ${htmlBlocks.join("")}
    </div>
  `;
}
