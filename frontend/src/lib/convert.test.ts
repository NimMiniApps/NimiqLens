import { describe, it, expect } from 'vitest'
import { computeAssetAmount, convertNimBalanceToFiat, formatAssetAmount, formatFiatRate, formatNimAmount } from './convert'

describe('computeAssetAmount', () => {
  it('divides fiat amount by the asset rate', () => {
    expect(computeAssetAmount(10, 0.5)).toBe(20)
    expect(computeAssetAmount(12.99, 1)).toBeCloseTo(12.99)
  })
})

describe('formatAssetAmount', () => {
  it('formats NIM with 4 decimals when amount is below 1', () => {
    expect(formatAssetAmount('NIM', 0.5)).toBe('≈ 0.5000')
  })

  it('formats NIM with 2 decimals when amount is 1 or above', () => {
    expect(formatAssetAmount('NIM', 12.3456)).toBe('≈ 12.35')
  })

  it('formats USDT with 2 decimals', () => {
    expect(formatAssetAmount('USDT', 12.345)).toBe('≈ 12.35')
  })

  it('formats BTC with 8 decimals', () => {
    expect(formatAssetAmount('BTC', 0.000123456789)).toBe('≈ 0.00012346')
  })

  it('formats ETH with 6 decimals', () => {
    expect(formatAssetAmount('ETH', 1.23456789)).toBe('≈ 1.234568')
  })

  it('adds thousand separators and compact labels for large NIM amounts', () => {
    expect(formatAssetAmount('NIM', 2_642_217.35)).toBe('≈ 2,642,217.35 (2.64M)')
  })

  it('adds thousand separators for large USDT amounts', () => {
    expect(formatAssetAmount('USDT', 1234567.89)).toBe('≈ 1,234,567.89')
  })
})

describe('formatNimAmount', () => {
  it('formats small balances with two decimals', () => {
    expect(formatNimAmount(100)).toBe('100.00')
  })

  it('adds thousand separators and compact labels for large balances', () => {
    expect(formatNimAmount(2_642_217.35)).toBe('2,642,217.35 (2.64M)')
  })
})

describe('formatFiatRate', () => {
  it('shows extra precision for small NIM prices', () => {
    expect(formatFiatRate('NIM', 0.00043422)).toBe('0.000434')
  })

  it('formats large BTC prices without decimals', () => {
    expect(formatFiatRate('BTC', 55675)).toBe('55,675')
  })
})

describe('convertNimBalanceToFiat', () => {
  it('converts a NIM balance to every supported fiat currency', () => {
    const values = convertNimBalanceToFiat(100, {
      EUR: 0.01,
      USD: 0.011,
      GBP: 0.009,
      CHF: 0.0095,
      JPY: 1.6,
      CNY: 0.078,
      AUD: 0.0165,
      CAD: 0.0148,
      INR: 0.9,
      BRL: 0.054,
    })

    expect(values.EUR).toBeCloseTo(1)
    expect(values.USD).toBeCloseTo(1.1)
    expect(values.GBP).toBeCloseTo(0.9)
    expect(values.CHF).toBeCloseTo(0.95)
    expect(values.JPY).toBeCloseTo(160)
    expect(values.CNY).toBeCloseTo(7.8)
    expect(values.AUD).toBeCloseTo(1.65)
    expect(values.CAD).toBeCloseTo(1.48)
    expect(values.INR).toBeCloseTo(90)
    expect(values.BRL).toBeCloseTo(5.4)
  })
})
