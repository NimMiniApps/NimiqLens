import type { FiatCurrency } from './convert'

export interface DetectedPrice {
  amount: number
  currency: FiatCurrency
}

// Matches "1.234,56" / "1,234.56" (grouped) or "12.99" / "1234" / "1234.56" (plain).
const NUMBER = '\\d{1,3}(?:[.,]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?'

const SYMBOL_CURRENCY: Record<string, FiatCurrency> = {
  '€': 'EUR',
  $: 'USD',
  '£': 'GBP',
  '¥': 'JPY',
  '₹': 'INR',
}

/** Currency codes recognized as a suffix or prefix next to an amount (e.g. "12.99 AUD"). */
const CURRENCY_CODES = 'EUR|USD|GBP|CHF|JPY|CNY|AUD|CAD|INR|BRL'

interface PricePattern {
  regex: RegExp
  currency: (match: RegExpMatchArray) => FiatCurrency
  amount: (match: RegExpMatchArray) => string
}

const PATTERNS: PricePattern[] = [
  // €12.99, $24.50, £9.99, ¥1500, ₹999
  {
    regex: new RegExp(`([€$£¥₹])\\s?(${NUMBER})`),
    currency: (m) => SYMBOL_CURRENCY[m[1]],
    amount: (m) => m[2],
  },
  // 12,99 EUR / 24.50 USD / 9.99 GBP / 12.99 CHF / 1500 JPY / ...
  {
    regex: new RegExp(`(${NUMBER})\\s?(${CURRENCY_CODES})`, 'i'),
    currency: (m) => m[2].toUpperCase() as FiatCurrency,
    amount: (m) => m[1],
  },
  // EUR 12.99 / USD 24.50 / GBP 9.99 / JPY 1500 / ...
  {
    regex: new RegExp(`(${CURRENCY_CODES})\\s?(${NUMBER})`, 'i'),
    currency: (m) => m[1].toUpperCase() as FiatCurrency,
    amount: (m) => m[2],
  },
  // CHF 12.99, Fr. 9.50, Fr 9.50
  {
    regex: new RegExp(`(?:CHF|Fr\\.?)\\s?(${NUMBER})`, 'i'),
    currency: () => 'CHF',
    amount: (m) => m[1],
  },
]

/** Parses a number string that may use "." or "," as the decimal or thousands separator. */
function parseAmount(raw: string): number {
  const hasComma = raw.includes(',')
  const hasDot = raw.includes('.')

  if (hasComma && hasDot) {
    const decimalSep = raw.lastIndexOf(',') > raw.lastIndexOf('.') ? ',' : '.'
    const thousandsSep = decimalSep === ',' ? '.' : ','
    return Number.parseFloat(raw.split(thousandsSep).join('').replace(decimalSep, '.'))
  }

  if (hasComma || hasDot) {
    const sep = hasComma ? ',' : '.'
    const parts = raw.split(sep)
    if (parts.length === 2 && parts[1].length === 2) {
      return Number.parseFloat(parts.join('.'))
    }
    return Number.parseFloat(parts.join(''))
  }

  return Number.parseFloat(raw)
}

/**
 * Scans OCR'd text for a price-like pattern (symbol-prefixed, code-suffixed, or
 * CHF/Fr.-prefixed) and returns the first match found, or null if none.
 */
export function detectPrice(text: string, fallbackCurrency?: FiatCurrency): DetectedPrice | null {
  const normalizedText = text.replace(/(\d)\s*([.,])\s*(\d)/g, '$1$2$3')

  for (const pattern of PATTERNS) {
    const match = normalizedText.match(pattern.regex)
    if (!match) continue

    const amount = parseAmount(pattern.amount(match))
    if (Number.isNaN(amount)) continue

    return { amount, currency: pattern.currency(match) }
  }

  if (fallbackCurrency) {
    const bareDecimal = normalizedText.match(/\b(\d+[.,]\d{2})\b/)
    if (bareDecimal) {
      return { amount: parseAmount(bareDecimal[1]), currency: fallbackCurrency }
    }
  }

  return null
}
