/**
 * Currency — single source of truth for deal-value formatting and
 * the currency picker options.
 *
 * Before this module, ~6 components each defined their own
 * `Intl.NumberFormat(..., { currency: "USD" })` helper with USD
 * baked in. The default currency is now configurable per account
 * (accounts.default_currency, migration 021), so every formatter
 * takes a currency and falls back to DEFAULT_CURRENCY only when
 * nothing is known.
 */

/** App-wide fallback when no account/deal currency is available. */
export const DEFAULT_CURRENCY = "INR";

export interface CurrencyOption {
  /** ISO-4217 code, e.g. "INR". Stored verbatim in the DB. */
  code: string;
  /** Human label for the dropdown, e.g. "Indian Rupee". */
  label: string;
  /** Symbol for compact display, e.g. "₹". */
  symbol: string;
}

/**
 * Currency configuration. Locked exclusively to INR (Indian Rupee - ₹).
 */
export const CURRENCIES: CurrencyOption[] = [
  { code: "INR", label: "INR - Indian Rupee", symbol: "₹" },
];

/**
 * Format a deal value as an Indian Rupee (INR - ₹) currency string.
 * The workspace is strictly locked to INR as requested.
 * Automatically formats using Indian numbering system (e.g. ₹1,00,000 or ₹0).
 */
export function formatCurrency(
  value: number,
  _currency: string = DEFAULT_CURRENCY,
): string {
  const amount = Number(value) || 0;
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `₹${amount.toLocaleString("en-IN")}`;
  }
}

/**
 * Compact currency for tight spaces (donut center, legend rows, badges):
 * "₹1.2M" / "₹34.5k" / "₹900". Strictly locked to INR (₹).
 */
export function formatCurrencyShort(
  value: number,
  _currency: string = DEFAULT_CURRENCY,
): string {
  return `₹${formatCompactNumber(value)}`;
}

/**
 * Compact number for tight spaces (chart tiles, legends): 1_234 → "1.2k",
 * 1_200_000 → "1.2M", 900 → "900". The unit-less core shared with
 * {@link formatCurrencyShort}.
 */
export function formatCompactNumber(value: number): string {
  const v = Number(value || 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return v.toFixed(0);
}
