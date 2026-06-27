export type Asset = 'NIM' | 'USDT' | 'BTC' | 'ETH'
export type FiatCurrency = 'EUR' | 'USD' | 'GBP' | 'CHF' | 'JPY' | 'CNY' | 'AUD' | 'CAD' | 'INR' | 'BRL'

export const ASSETS: Asset[] = ['NIM', 'USDT', 'BTC', 'ETH']

/** Most commonly used fiat currency for each major region. */
export const FIAT_CURRENCIES: FiatCurrency[] = [
  'EUR', // Europe
  'USD', // United States
  'GBP', // United Kingdom
  'CHF', // Switzerland
  'JPY', // Japan
  'CNY', // China
  'AUD', // Australia
  'CAD', // Canada
  'INR', // India
  'BRL', // Brazil
]
export type FiatValues = Record<FiatCurrency, number>

/** Fiat currencies that are conventionally displayed without decimal places. */
const ZERO_DECIMAL_FIAT_CURRENCIES: ReadonlySet<FiatCurrency> = new Set(['JPY'])

/** Formats a fiat amount with the decimal precision conventional for the currency. */
export function formatFiatAmount(currency: FiatCurrency, amount: number): string {
  const decimals = ZERO_DECIMAL_FIAT_CURRENCIES.has(currency) ? 0 : 2
  return formatDecimalAmount(amount, decimals, decimals)
}

function formatDecimalAmount(
  amount: number,
  minimumFractionDigits: number,
  maximumFractionDigits: number,
): string {
  return amount.toLocaleString('en-US', { minimumFractionDigits, maximumFractionDigits })
}

function formatCompactAmount(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(amount)
}

/** Formats a NIM amount for balances and affordability hints. */
export function formatNimAmount(amount: number): string {
  const decimals = amount < 1 ? 4 : 2
  const formatted = formatDecimalAmount(amount, decimals, decimals)
  if (amount >= 1_000_000) {
    return `${formatted} (${formatCompactAmount(amount)})`
  }
  return formatted
}

/** assetAmount = fiatAmount / assetPriceInFiat */
export function computeAssetAmount(fiatAmount: number, rate: number): number {
  return fiatAmount / rate
}

export function convertNimBalanceToFiat(balanceNim: number, rates: FiatValues): FiatValues {
  return Object.fromEntries(
    FIAT_CURRENCIES.map((currency) => [currency, balanceNim * rates[currency]]),
  ) as FiatValues
}

/** Formats an asset amount with the decimal precision defined in the design spec. */
export function formatAssetAmount(asset: Asset, amount: number): string {
  const decimals = assetAmountDecimals(asset, amount)
  const formatted = formatDecimalAmount(amount, decimals, decimals)
  const compactSuffix = asset === 'NIM' && amount >= 1_000_000
    ? ` (${formatCompactAmount(amount)})`
    : ''
  return `≈ ${formatted}${compactSuffix}`
}

function assetAmountDecimals(asset: Asset, amount: number): number {
  switch (asset) {
    case 'NIM':
      return amount < 1 ? 4 : 2
    case 'USDT':
      return 2
    case 'BTC':
      return 8
    case 'ETH':
      return 6
    default: {
      const _exhaustive: never = asset
      throw new Error(`Unsupported asset: ${_exhaustive}`)
    }
  }
}

/** Formats a fiat price for one unit of an asset (rates screen). */
export function formatFiatRate(asset: Asset, rate: number): string {
  if (asset === 'NIM') {
    return rate.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 })
  }
  if (asset === 'USDT') {
    return rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  }
  return rate.toLocaleString('en-US', { maximumFractionDigits: 0 })
}
