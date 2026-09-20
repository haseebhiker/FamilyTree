/** Haseeb's WhatsApp number, digits only with the country code (+1 310 634 2298) — the format wa.me links need. */
const HASEEB_WHATSAPP = "13106342298";

export function whatsappLink(message: string) {
  return `https://wa.me/${HASEEB_WHATSAPP}?text=${encodeURIComponent(message)}`;
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path d="M10 2a8 8 0 0 0-6.9 12L2 18l4.1-1.1A8 8 0 1 0 10 2Zm-3 6.2a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6Zm3 0a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6Zm3 0a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6Z" />
    </svg>
  );
}

/** A big green "Ask Haseeb on WhatsApp" button — opens WhatsApp with a short message already typed. */
export function AskHaseebButton({
  message = "Hi Haseeb, I have a question about the family tree: ",
  label = "Ask Haseeb on WhatsApp",
}: {
  message?: string;
  label?: string;
}) {
  return (
    <a
      href={whatsappLink(message)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center gap-2 rounded-md bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700"
    >
      <ChatIcon className="h-4 w-4" />
      {label}
    </a>
  );
}

/** A small, quiet one-line version for page footers and sign-in screens. */
export function AskHaseebLine({
  message = "Hi Haseeb, I have a question about the family tree: ",
  prefix = "Questions?",
  className = "",
}: {
  message?: string;
  prefix?: string;
  className?: string;
}) {
  return (
    <p className={`text-center text-xs text-slate-500 ${className}`}>
      {prefix}{" "}
      <a
        href={whatsappLink(message)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 font-medium text-green-700 hover:underline"
      >
        <ChatIcon className="h-3.5 w-3.5" />
        Ask Haseeb on WhatsApp
      </a>
    </p>
  );
}
