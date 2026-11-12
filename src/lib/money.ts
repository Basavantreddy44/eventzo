/**
 * Money is stored as integer paise (`bigint`) with an ISO-4217 currency (D6).
 * Never use floats for amounts. These helpers convert at the UI edge only.
 */

const RUPEES_PATTERN = /^\s*(\d{1,13})(?:\.(\d{1,2}))?\s*$/;

/** Parses user input like "1,25,000.50" into paise. Returns null if invalid. */
export function rupeesToPaise(input: string): bigint | null {
  const cleaned = input.replace(/[,\s₹]/g, "");
  const match = RUPEES_PATTERN.exec(cleaned);
  if (!match) return null;
  const rupees = BigInt(match[1]);
  const fraction = BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  return rupees * 100n + fraction;
}

/** Formats paise for display, e.g. 12500050n → "₹1,25,000.50" (en-IN grouping). */
export function formatPaise(
  paise: bigint | number,
  options: { currency?: string; locale?: string; hideZeroDecimals?: boolean } = {},
): string {
  const { currency = "INR", locale = "en-IN", hideZeroDecimals = true } = options;
  const value = typeof paise === "bigint" ? paise : BigInt(Math.trunc(paise));
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const rupees = abs / 100n;
  const fraction = abs % 100n;
  const decimalString = `${negative ? "-" : ""}${rupees}.${fraction.toString().padStart(2, "0")}`;

  const showDecimals = !(hideZeroDecimals && fraction === 0n);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(decimalString as unknown as number); // exact decimal string (Intl.NumberFormat v3)
}
