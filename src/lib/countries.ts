export interface Country {
  name: string;
  iso2: string;
  dialCode: string;
}

// Name, ISO 3166-1 alpha-2, calling code. Used for the mandatory
// country-code picker on phone numbers so every stored value is a full
// E.164 number (see src/lib/actions/contact-details.ts) — needed for
// WhatsApp/tel: links to work regardless of which country a member is in.
export const COUNTRIES: Country[] = [
  { name: "United States", iso2: "US", dialCode: "1" },
  { name: "Canada", iso2: "CA", dialCode: "1" },
  { name: "United Kingdom", iso2: "GB", dialCode: "44" },
  { name: "India", iso2: "IN", dialCode: "91" },
  { name: "United Arab Emirates", iso2: "AE", dialCode: "971" },
  { name: "Saudi Arabia", iso2: "SA", dialCode: "966" },
  { name: "Qatar", iso2: "QA", dialCode: "974" },
  { name: "Kuwait", iso2: "KW", dialCode: "965" },
  { name: "Bahrain", iso2: "BH", dialCode: "973" },
  { name: "Oman", iso2: "OM", dialCode: "968" },
  { name: "Pakistan", iso2: "PK", dialCode: "92" },
  { name: "Bangladesh", iso2: "BD", dialCode: "880" },
  { name: "Sri Lanka", iso2: "LK", dialCode: "94" },
  { name: "Nepal", iso2: "NP", dialCode: "977" },
  { name: "Singapore", iso2: "SG", dialCode: "65" },
  { name: "Malaysia", iso2: "MY", dialCode: "60" },
  { name: "Indonesia", iso2: "ID", dialCode: "62" },
  { name: "Australia", iso2: "AU", dialCode: "61" },
  { name: "New Zealand", iso2: "NZ", dialCode: "64" },
  { name: "Germany", iso2: "DE", dialCode: "49" },
  { name: "France", iso2: "FR", dialCode: "33" },
  { name: "Italy", iso2: "IT", dialCode: "39" },
  { name: "Spain", iso2: "ES", dialCode: "34" },
  { name: "Netherlands", iso2: "NL", dialCode: "31" },
  { name: "Belgium", iso2: "BE", dialCode: "32" },
  { name: "Switzerland", iso2: "CH", dialCode: "41" },
  { name: "Austria", iso2: "AT", dialCode: "43" },
  { name: "Sweden", iso2: "SE", dialCode: "46" },
  { name: "Norway", iso2: "NO", dialCode: "47" },
  { name: "Denmark", iso2: "DK", dialCode: "45" },
  { name: "Finland", iso2: "FI", dialCode: "358" },
  { name: "Ireland", iso2: "IE", dialCode: "353" },
  { name: "Portugal", iso2: "PT", dialCode: "351" },
  { name: "Poland", iso2: "PL", dialCode: "48" },
  { name: "Turkey", iso2: "TR", dialCode: "90" },
  { name: "Egypt", iso2: "EG", dialCode: "20" },
  { name: "South Africa", iso2: "ZA", dialCode: "27" },
  { name: "Nigeria", iso2: "NG", dialCode: "234" },
  { name: "Kenya", iso2: "KE", dialCode: "254" },
  { name: "Jordan", iso2: "JO", dialCode: "962" },
  { name: "Lebanon", iso2: "LB", dialCode: "961" },
  { name: "Iraq", iso2: "IQ", dialCode: "964" },
  { name: "Yemen", iso2: "YE", dialCode: "967" },
  { name: "China", iso2: "CN", dialCode: "86" },
  { name: "Japan", iso2: "JP", dialCode: "81" },
  { name: "South Korea", iso2: "KR", dialCode: "82" },
  { name: "Philippines", iso2: "PH", dialCode: "63" },
  { name: "Thailand", iso2: "TH", dialCode: "66" },
  { name: "Vietnam", iso2: "VN", dialCode: "84" },
  { name: "Hong Kong", iso2: "HK", dialCode: "852" },
  { name: "Brazil", iso2: "BR", dialCode: "55" },
  { name: "Mexico", iso2: "MX", dialCode: "52" },
  { name: "Argentina", iso2: "AR", dialCode: "54" },
  { name: "Russia", iso2: "RU", dialCode: "7" },
];

export const DEFAULT_COUNTRY_ISO2 = "US";

export function findCountry(iso2: string): Country | undefined {
  return COUNTRIES.find((c) => c.iso2 === iso2);
}

/** Strips the leading "+" for WhatsApp's wa.me links, which expect bare digits. */
export function e164ToWhatsAppDigits(e164: string): string {
  return e164.replace(/^\+/, "");
}
