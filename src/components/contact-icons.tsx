"use client";

import { e164ToWhatsAppDigits } from "@/lib/countries";
import type { ContactType } from "@/lib/types";

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 1.67c2.22 0 4.29.86 5.86 2.43a8.23 8.23 0 0 1 2.43 5.81c0 4.55-3.71 8.25-8.27 8.25a8.3 8.3 0 0 1-4.21-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.39c0-4.55 3.71-8.24 8.24-8.24Zm-4.52 4.6c-.16 0-.42.06-.64.31-.22.25-.85.83-.85 2.02 0 1.19.87 2.34.99 2.5.12.16 1.7 2.72 4.19 3.7 2.07.82 2.49.66 2.94.62.45-.04 1.45-.59 1.66-1.17.2-.57.2-1.06.14-1.17-.06-.1-.22-.16-.45-.28-.24-.12-1.45-.71-1.67-.79-.22-.08-.39-.12-.55.13-.16.24-.63.79-.77.95-.14.16-.28.18-.53.06-.24-.12-1.02-.38-1.95-1.2-.72-.64-1.21-1.44-1.35-1.68-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.31-.02-.43-.06-.12-.55-1.36-.76-1.85-.2-.48-.4-.42-.55-.42Z" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
      <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h1.148a1.5 1.5 0 0 1 1.465 1.175l.716 3.223a1.5 1.5 0 0 1-.437 1.409l-.97.97a.5.5 0 0 0-.093.573 11.97 11.97 0 0 0 5.32 5.32.5.5 0 0 0 .573-.093l.97-.97a1.5 1.5 0 0 1 1.409-.437l3.223.716A1.5 1.5 0 0 1 18 16.352V17.5a1.5 1.5 0 0 1-1.5 1.5H15c-8.284 0-15-6.716-15-15Z" />
    </svg>
  );
}

function TextIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
      <path
        fillRule="evenodd"
        d="M2 5.5A2.5 2.5 0 0 1 4.5 3h11A2.5 2.5 0 0 1 18 5.5v6a2.5 2.5 0 0 1-2.5 2.5H9.06l-3.5 3v-3H4.5A2.5 2.5 0 0 1 2 11.5v-6Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
      <path d="M3 4a2 2 0 0 0-2 2v.5l9 5.25L19 6.5V6a2 2 0 0 0-2-2H3Z" />
      <path d="M19 8.24l-8.55 5-.45.26-.45-.26L1 8.24V14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.24Z" />
    </svg>
  );
}

export function ContactIcons({ contactType, value }: { contactType: ContactType; value: string }) {
  if (contactType === "phone") {
    const waDigits = e164ToWhatsAppDigits(value);
    return (
      <span className="flex items-center gap-4">
        <a
          href={`https://wa.me/${waDigits}`}
          target="_blank"
          rel="noreferrer"
          title="Message on WhatsApp"
          className="text-green-600 hover:text-green-700"
        >
          <WhatsAppIcon />
        </a>
        <a href={`sms:${value}`} title="Send a text" className="text-blue-500 hover:text-blue-600">
          <TextIcon />
        </a>
        <a
          href={`tel:${value}`}
          title="Call"
          className="text-slate-500 hover:text-slate-700"
          onClick={(e) => {
            // Most of the family is spread internationally — an accidental
            // tap here could trigger a real international call, so this
            // one specifically asks first (WhatsApp/text don't, since
            // neither risks a surprise carrier charge the same way).
            if (!confirm(`Call ${value}? This may be an international call depending on your phone plan.`)) {
              e.preventDefault();
            }
          }}
        >
          <PhoneIcon />
        </a>
      </span>
    );
  }
  if (contactType === "email") {
    return (
      <a href={`mailto:${value}`} title="Send email" className="text-slate-500 hover:text-slate-700">
        <MailIcon />
      </a>
    );
  }
  return null;
}
