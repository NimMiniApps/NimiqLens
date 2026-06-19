import { describe, it, expect } from 'vitest'
import {
  comparePriceCandidates,
  detectPrice,
  markSuspiciousIsolatedIntegers,
  reconstructPriceCandidates,
} from './priceDetection'

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

  it('rejects symbol prices that conflict with the selected scan currency', () => {
    expect(detectPrice('¥8', 'EUR')).toBeNull()
    expect(detectPrice('$2.89', 'EUR')).toBeNull()
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

describe('reconstructPriceCandidates', () => {
  it('reconstructs $299 and 95 into 299.95 USD', () => {
    const candidates = reconstructPriceCandidates([
      { text: '$', confidence: 80, digitConfidence: 80, bbox: { x: 0, y: 0, width: 8, height: 20 } },
      { text: '299', confidence: 90, digitConfidence: 92, bbox: { x: 10, y: 0, width: 40, height: 30 } },
      { text: '95', confidence: 85, digitConfidence: 88, bbox: { x: 55, y: 2, width: 16, height: 14 } },
    ])

    expect(candidates.some((candidate) => candidate.parsed.amount === 299.95 && candidate.parsed.currency === 'USD')).toBe(true)
  })

  it('reconstructs €3 and 99 into 3.99 EUR', () => {
    const candidates = reconstructPriceCandidates([
      { text: '€', confidence: 80, digitConfidence: 80, bbox: { x: 0, y: 0, width: 8, height: 20 } },
      { text: '3', confidence: 90, digitConfidence: 92, bbox: { x: 10, y: 0, width: 20, height: 30 } },
      { text: '99', confidence: 85, digitConfidence: 88, bbox: { x: 34, y: 2, width: 16, height: 14 } },
    ], 'EUR')

    expect(candidates.some((candidate) => candidate.parsed.amount === 3.99 && candidate.parsed.currency === 'EUR')).toBe(true)
  })

  it('reconstructs superscript cents split into two one-digit fragments', () => {
    const candidates = reconstructPriceCandidates([
      { text: '€', confidence: 80, digitConfidence: 80, bbox: { x: 0, y: 12, width: 8, height: 20 } },
      { text: '3', confidence: 96, digitConfidence: 96, bbox: { x: 12, y: 10, width: 24, height: 28 } },
      { text: '9', confidence: 84, digitConfidence: 84, bbox: { x: 64, y: 4, width: 18, height: 12 } },
      { text: '9', confidence: 84, digitConfidence: 84, bbox: { x: 84, y: 4, width: 18, height: 12 } },
    ], 'EUR')

    const split = candidates.find((candidate) => candidate.parsed.amount === 3.99)
    const whole = candidates.find((candidate) => candidate.parsed.amount === 3)

    expect(split?.parsed.currency).toBe('EUR')
    expect(split?.splitCents).toBe(true)
    expect(comparePriceCandidates(
      { ...split!, centerDistance: 5 },
      { ...whole!, centerDistance: 5 },
    )).toBeLessThan(0)
  })

  it('does not invent fallback-currency bare prices when a conflicting symbol is present nearby', () => {
    const candidates = reconstructPriceCandidates([
      { text: '$', confidence: 80, digitConfidence: 0, bbox: { x: 0, y: 0, width: 12, height: 20 } },
      { text: '8', confidence: 90, digitConfidence: 90, bbox: { x: 80, y: 0, width: 16, height: 20 } },
      { text: '32', confidence: 90, digitConfidence: 90, bbox: { x: 100, y: 0, width: 24, height: 20 } },
    ], 'EUR')

    expect(candidates).toEqual([])
  })

  it('marks a lone $900 candidate suspicious when split cents exist nearby', () => {
    const candidates = markSuspiciousIsolatedIntegers(
      reconstructPriceCandidates([
        { text: '$', confidence: 80, digitConfidence: 80, bbox: { x: 0, y: 0, width: 8, height: 20 } },
        { text: '299', confidence: 90, digitConfidence: 92, bbox: { x: 10, y: 0, width: 40, height: 30 } },
        { text: '95', confidence: 85, digitConfidence: 88, bbox: { x: 55, y: 2, width: 16, height: 14 } },
        { text: '$900', confidence: 88, digitConfidence: 90, bbox: { x: 120, y: 0, width: 50, height: 30 } },
      ], 'USD'),
    )

    const split = candidates.find((candidate) => candidate.parsed.amount === 299.95)
    const isolated = candidates.find((candidate) => candidate.parsed.amount === 900)

    expect(split?.suspiciousIsolatedInteger).toBe(false)
    expect(isolated?.suspiciousIsolatedInteger).toBe(true)
    expect(comparePriceCandidates(
      { ...split!, centerDistance: 5 },
      { ...isolated!, centerDistance: 5 },
    )).toBeLessThan(0)
  })
})
