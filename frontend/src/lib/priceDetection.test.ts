import { describe, it, expect } from 'vitest'
import { detectPrice } from './priceDetection'

describe('detectPrice', () => {
  it('detects a symbol-prefixed euro price', () => {
    expect(detectPrice('€12.99')).toEqual({ amount: 12.99, currency: 'EUR' })
  })

  it('detects a European-formatted price with a EUR code suffix', () => {
    expect(detectPrice('12,99 EUR')).toEqual({ amount: 12.99, currency: 'EUR' })
  })

  it('detects a symbol-prefixed dollar price', () => {
    expect(detectPrice('$24.50')).toEqual({ amount: 24.5, currency: 'USD' })
  })

  it('detects a price with a USD code suffix', () => {
    expect(detectPrice('24.50 USD')).toEqual({ amount: 24.5, currency: 'USD' })
  })

  it('detects a symbol-prefixed pound price', () => {
    expect(detectPrice('£9.99')).toEqual({ amount: 9.99, currency: 'GBP' })
  })

  it('detects a CHF-prefixed price', () => {
    expect(detectPrice('CHF 12.99')).toEqual({ amount: 12.99, currency: 'CHF' })
  })

  it('detects a Fr.-prefixed price', () => {
    expect(detectPrice('Fr. 9.50')).toEqual({ amount: 9.5, currency: 'CHF' })
  })

  it('detects a price with thousands separators', () => {
    expect(detectPrice('€1.234,56')).toEqual({ amount: 1234.56, currency: 'EUR' })
  })

  it('finds a price within surrounding receipt text', () => {
    expect(detectPrice('Total\n€12.99\nThank you')).toEqual({ amount: 12.99, currency: 'EUR' })
  })

  it('detects a price when OCR inserts spaces around the decimal separator', () => {
    expect(detectPrice('TOTAL € 12, 99')).toEqual({ amount: 12.99, currency: 'EUR' })
  })

  it('detects a price when the currency code appears before the amount', () => {
    expect(detectPrice('TOTAL EUR 12,99')).toEqual({ amount: 12.99, currency: 'EUR' })
  })

  it('detects a bare decimal price when a scan currency is supplied', () => {
    expect(detectPrice('SPECIAL OFFER 12.99', 'EUR')).toEqual({ amount: 12.99, currency: 'EUR' })
  })

  it('returns null when no price-like pattern is found', () => {
    expect(detectPrice('Open 9am - 5pm')).toBeNull()
  })

  it('detects a euro price using the "X,-" whole-amount price-tag notation', () => {
    expect(detectPrice('€10,-')).toEqual({ amount: 10, currency: 'EUR' })
  })

  it('detects a whole-amount price with a EUR code suffix using "X,-" notation', () => {
    expect(detectPrice('10,- EUR')).toEqual({ amount: 10, currency: 'EUR' })
  })

  it('detects a Swiss franc whole-amount price using "X.-" notation', () => {
    expect(detectPrice('Fr. 5.-')).toEqual({ amount: 5, currency: 'CHF' })
  })

  it('detects a bare whole-amount price with "X,-" notation when a scan currency is supplied', () => {
    expect(detectPrice('12,-', 'EUR')).toEqual({ amount: 12, currency: 'EUR' })
  })

  it('detects a yen price with the ¥ symbol', () => {
    expect(detectPrice('¥1500')).toEqual({ amount: 1500, currency: 'JPY' })
  })

  it('detects a rupee price with the ₹ symbol', () => {
    expect(detectPrice('₹999')).toEqual({ amount: 999, currency: 'INR' })
  })

  it('restores a missing decimal separator for a sub-one-unit symbol price like €095', () => {
    expect(detectPrice('€095')).toEqual({ amount: 0.95, currency: 'EUR' })
  })

  it('prefers the selected scan currency over a noisy OCR currency code', () => {
    expect(detectPrice('1,99 GBP', 'EUR')).toEqual({ amount: 1.99, currency: 'EUR' })
  })

  it('detects a symbol price when OCR splits the whole and decimal fragments', () => {
    expect(detectPrice('€ 3. 99')).toEqual({ amount: 3.99, currency: 'EUR' })
  })

  it('detects a fallback-currency price when OCR splits the whole and decimal fragments', () => {
    expect(detectPrice('3 . 99', 'EUR')).toEqual({ amount: 3.99, currency: 'EUR' })
  })

  it('detects a symbol price when OCR splits the decimal fragment onto the next line', () => {
    expect(detectPrice('€ 3.\n99')).toEqual({ amount: 3.99, currency: 'EUR' })
  })

  it('detects a fallback-currency price when OCR splits the decimal fragment onto the next line', () => {
    expect(detectPrice('3.\n99', 'EUR')).toEqual({ amount: 3.99, currency: 'EUR' })
  })

  it('detects a symbol price when OCR drops the separator between whole and cents', () => {
    expect(detectPrice('€ 3 99')).toEqual({ amount: 3.99, currency: 'EUR' })
  })

  it('detects a fallback-currency price when OCR drops the separator between whole and cents', () => {
    expect(detectPrice('3 99', 'EUR')).toEqual({ amount: 3.99, currency: 'EUR' })
  })

  it('does not invent a cents price from three separate digit groups', () => {
    expect(detectPrice('2 7 99', 'EUR')).toBeNull()
  })
})
