import type { FiatCurrency } from './convert'
import type { RegionBBox } from './priceRegions'
import {
  CLUSTER_MAX_HORIZONTAL_GAP,
  CLUSTER_MAX_VERTICAL_GAP,
} from './priceRegions'

export interface DetectedPrice {
  amount: number
  currency: FiatCurrency
}

export interface PriceFragment {
  text: string
  confidence: number
  digitConfidence: number
  bbox: RegionBBox
}

export interface ReconstructedPriceCandidate {
  parsed: DetectedPrice
  text: string
  confidence: number
  digitConfidence: number
  bbox: RegionBBox
  centerX: number
  centerY: number
  layoutScore: number
  splitCents: boolean
  suspiciousIsolatedInteger: boolean
}

const CURRENCY_SYMBOL_PATTERN = /[€$£¥₹]/
const INTEGER_FRAGMENT_PATTERN = /^\$?\d{1,4}$/
const CENTS_FRAGMENT_PATTERN = /^\d{2}$/
const CENT_DIGIT_FRAGMENT_PATTERN = /^\d$/
const WHOLE_AMOUNT_PATTERN = /^\d+$/
const SUPERSCRIPT_CENTS_MAX_HORIZONTAL_GAP = CLUSTER_MAX_HORIZONTAL_GAP * 1.5

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

const HIGH_CONFIDENCE_PATTERNS: PricePattern[] = [
  // €12.99, $24.50, £9.99, ¥1500, ₹999
  {
    regex: new RegExp(`([€$£¥₹])\\s?(${NUMBER})`),
    currency: (m) => SYMBOL_CURRENCY[m[1]],
    amount: (m) => m[2],
  },
  // CHF 12.99, Fr. 9.50, Fr 9.50
  {
    regex: new RegExp(`(?:CHF|Fr\\.?)\\s?(${NUMBER})`, 'i'),
    currency: () => 'CHF',
    amount: (m) => m[1],
  },
]

const OCR_CODE_PATTERNS: PricePattern[] = [
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

function normalizeLikelyMissingDecimal(text: string): string {
  return text
    .replace(/([€$£¥₹]\s*)0(\d{2})\b/g, '$10,$2')
    .replace(/([€$£¥₹]\s*)(?<!\d\s)(\d{1,3})\s+(\d{2})\b/g, '$1$2,$3')
    .replace(new RegExp(`\\b(${CURRENCY_CODES})\\s*0(\\d{2})\\b`, 'gi'), '$1 0,$2')
    .replace(new RegExp(`\\b(${CURRENCY_CODES})\\s+(?<!\\d\\s)(\\d{1,3})\\s+(\\d{2})\\b`, 'gi'), '$1 $2,$3')
    .replace(new RegExp(`\\b0(\\d{2})\\s*(${CURRENCY_CODES})\\b`, 'gi'), '0,$1 $2')
    .replace(new RegExp(`(?<!\\d\\s)\\b(\\d{1,3})\\s+(\\d{2})\\s*(${CURRENCY_CODES})\\b`, 'gi'), '$1,$2 $3')
}

function detectWithPatterns(text: string, patterns: PricePattern[]): DetectedPrice | null {
  for (const pattern of patterns) {
    const match = text.match(pattern.regex)
    if (!match) continue

    const amount = parseAmount(pattern.amount(match))
    if (Number.isNaN(amount)) continue

    return { amount, currency: pattern.currency(match) }
  }

  return null
}

/**
 * Scans OCR'd text for a price-like pattern (symbol-prefixed, code-suffixed, or
 * CHF/Fr.-prefixed) and returns the first match found, or null if none.
 */
export function detectPrice(text: string, fallbackCurrency?: FiatCurrency): DetectedPrice | null {
  const normalizedText = normalizeLikelyMissingDecimal(
    text
    .replace(/(\d)\s*([.,])\s*(\d)/g, '$1$2$3')
    // "X,-" / "X.-" is a common price-tag shorthand for a whole amount (e.g. "10,-" = 10.00).
    .replace(/(\d+)\s*[.,]\s*-+/g, '$1,00'),
  )

  const explicitSymbolOrFr = detectWithPatterns(normalizedText, HIGH_CONFIDENCE_PATTERNS)
  if (explicitSymbolOrFr) {
    if (fallbackCurrency && explicitSymbolOrFr.currency !== fallbackCurrency) return null
    return explicitSymbolOrFr
  }

  if (fallbackCurrency) {
    const bareDecimal = normalizedText.match(/\b(\d+[.,]\d{2})\b/)
    if (bareDecimal) {
      return { amount: parseAmount(bareDecimal[1]), currency: fallbackCurrency }
    }

    const spacedCents = normalizedText.match(/(?<!\d\s)\b(\d{1,3})\s+(\d{2})\b/)
    if (spacedCents) {
      return { amount: parseAmount(`${spacedCents[1]}.${spacedCents[2]}`), currency: fallbackCurrency }
    }
  }

  return detectWithPatterns(normalizedText, OCR_CODE_PATTERNS)
}

function normalizeFragmentText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function fragmentLooksLikeCurrencySymbol(text: string): boolean {
  return CURRENCY_SYMBOL_PATTERN.test(text) && !/\d/.test(text)
}

function symbolCurrencyInText(text: string): FiatCurrency | null {
  const symbol = text.match(CURRENCY_SYMBOL_PATTERN)?.[0]
  return symbol ? SYMBOL_CURRENCY[symbol] : null
}

function fragmentHasCurrencySymbol(fragment: PriceFragment): boolean {
  return symbolCurrencyInText(fragment.text) !== null
}

function fragmentLooksLikeInteger(text: string): boolean {
  const normalized = normalizeFragmentText(text)
  if (CENTS_FRAGMENT_PATTERN.test(normalized)) {
    return false
  }
  return INTEGER_FRAGMENT_PATTERN.test(normalized) || WHOLE_AMOUNT_PATTERN.test(normalized)
}

function fragmentIsAtomicPriceRead(text: string): boolean {
  return /[€$£¥₹]\s*\d{2,}/.test(normalizeFragmentText(text))
}

function fragmentLooksLikeCents(text: string): boolean {
  return CENTS_FRAGMENT_PATTERN.test(normalizeFragmentText(text))
}

function fragmentLooksLikeCentDigit(text: string): boolean {
  return CENT_DIGIT_FRAGMENT_PATTERN.test(normalizeFragmentText(text))
}

function bboxArea(bbox: RegionBBox): number {
  return Math.max(1, bbox.width * bbox.height)
}

function buildCombinedPriceText(
  symbol: string | null,
  integerText: string,
  centsText: string | null,
): string {
  const integer = integerText.replace(/^\$/, '')
  if (centsText) {
    return symbol ? `${symbol}${integer}.${centsText}` : `${integer}.${centsText}`
  }
  return symbol ? `${symbol}${integer}` : integer
}

function scoreSplitLayout(
  symbol: PriceFragment | null,
  integer: PriceFragment,
  cents: PriceFragment | null,
): number {
  let score = 0
  if (symbol) score += 20
  if (cents) {
    score += 40
    if (cents.bbox.x >= integer.bbox.x) score += 20
    if (cents.bbox.height <= integer.bbox.height) score += 10
    if (cents.bbox.y <= integer.bbox.y + integer.bbox.height * 0.35) score += 10
  }
  score += Math.min(20, Math.round(Math.log10(bboxArea(integer.bbox) + 1)))
  return score
}

function fragmentHorizontalGap(a: PriceFragment, b: PriceFragment): number {
  if (a.bbox.x + a.bbox.width < b.bbox.x) return b.bbox.x - (a.bbox.x + a.bbox.width)
  if (b.bbox.x + b.bbox.width < a.bbox.x) return a.bbox.x - (b.bbox.x + b.bbox.width)
  return 0
}

function fragmentVerticalGap(a: PriceFragment, b: PriceFragment): number {
  if (a.bbox.y + a.bbox.height < b.bbox.y) return b.bbox.y - (a.bbox.y + a.bbox.height)
  if (b.bbox.y + b.bbox.height < a.bbox.y) return a.bbox.y - (b.bbox.y + b.bbox.height)
  return 0
}

function fragmentsAreSpatiallyRelated(a: PriceFragment, b: PriceFragment): boolean {
  return (
    fragmentHorizontalGap(a, b) <= CLUSTER_MAX_HORIZONTAL_GAP &&
    fragmentVerticalGap(a, b) <= CLUSTER_MAX_VERTICAL_GAP
  )
}

function fragmentsAreSuperscriptCentsRelated(integer: PriceFragment, centDigit: PriceFragment): boolean {
  return (
    fragmentHorizontalGap(integer, centDigit) <= SUPERSCRIPT_CENTS_MAX_HORIZONTAL_GAP &&
    fragmentVerticalGap(integer, centDigit) <= CLUSTER_MAX_VERTICAL_GAP
  )
}

function mergedFragmentBbox(fragments: PriceFragment[]): RegionBBox {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const fragment of fragments) {
    minX = Math.min(minX, fragment.bbox.x)
    minY = Math.min(minY, fragment.bbox.y)
    maxX = Math.max(maxX, fragment.bbox.x + fragment.bbox.width)
    maxY = Math.max(maxY, fragment.bbox.y + fragment.bbox.height)
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

function buildCentsFromSingleDigitFragments(
  integer: PriceFragment,
  fragments: PriceFragment[],
): PriceFragment | null {
  const digits = fragments
    .filter(
      (fragment) =>
        fragment !== integer &&
        fragmentLooksLikeCentDigit(fragment.text) &&
        fragment.bbox.x >= integer.bbox.x + integer.bbox.width - 2 &&
        fragment.bbox.height <= integer.bbox.height * 0.75 &&
        fragment.bbox.y <= integer.bbox.y + integer.bbox.height * 0.45,
    )
    .sort((a, b) => a.bbox.x - b.bbox.x)

  for (let i = 0; i < digits.length - 1; i += 1) {
    const pair = [digits[i], digits[i + 1]]
    if (!fragmentsAreSuperscriptCentsRelated(integer, pair[0])) continue
    if (!fragmentsAreSpatiallyRelated(pair[0], pair[1])) continue

    const bbox = mergedFragmentBbox(pair)
    return {
      text: `${normalizeFragmentText(pair[0].text)}${normalizeFragmentText(pair[1].text)}`,
      confidence: Math.min(...pair.map((fragment) => fragment.confidence)),
      digitConfidence: Math.min(...pair.map((fragment) => fragment.digitConfidence)),
      bbox,
    }
  }

  return null
}

function buildCandidateFromFragments(
  fragments: PriceFragment[],
  fallbackCurrency?: FiatCurrency,
): ReconstructedPriceCandidate | null {
  if (fragments.length === 0) return null

  const combinedText = normalizeFragmentText(fragments.map((fragment) => fragment.text).join(' '))
  const directParsed = detectPrice(combinedText, fallbackCurrency)
  if (directParsed) {
    const bbox = mergedFragmentBbox(fragments)
    const digitConfidence = Math.max(...fragments.map((fragment) => fragment.digitConfidence))
    const confidence = Math.max(...fragments.map((fragment) => fragment.confidence))
    return {
      parsed: directParsed,
      text: combinedText,
      confidence,
      digitConfidence,
      bbox,
      centerX: bbox.x + bbox.width / 2,
      centerY: bbox.y + bbox.height / 2,
      layoutScore: scoreSplitLayout(
        fragments.find((fragment) => fragmentLooksLikeCurrencySymbol(fragment.text)) ?? null,
        fragments.find((fragment) => fragmentLooksLikeInteger(fragment.text)) ?? fragments[0],
        fragments.find((fragment) => fragmentLooksLikeCents(fragment.text)) ?? null,
      ),
      splitCents: fragments.some((fragment) => fragmentLooksLikeCents(fragment.text)),
      suspiciousIsolatedInteger: false,
    }
  }

  const symbol = fragments.find((fragment) => fragmentLooksLikeCurrencySymbol(fragment.text)) ?? null
  const integerCandidates = fragments.filter((fragment) => fragmentLooksLikeInteger(fragment.text))
  const centsCandidates = fragments.filter((fragment) => fragmentLooksLikeCents(fragment.text))

  if (integerCandidates.length === 0) return null

  const integer = [...integerCandidates].sort(
    (a, b) => bboxArea(b.bbox) - bboxArea(a.bbox) || a.bbox.x - b.bbox.x,
  )[0]
  const cents = centsCandidates.sort((a, b) => a.bbox.x - b.bbox.x)[0] ?? null

  const text = buildCombinedPriceText(
    symbol?.text.match(CURRENCY_SYMBOL_PATTERN)?.[0] ?? null,
    integer.text,
    cents?.text ?? null,
  )
  const parsed = detectPrice(text, fallbackCurrency)
  if (!parsed) return null

  const usedFragments = [integer, ...(cents ? [cents] : []), ...(symbol ? [symbol] : [])]
  const bbox = mergedFragmentBbox(usedFragments)
  const digitConfidence = Math.max(...usedFragments.map((fragment) => fragment.digitConfidence))
  const confidence = Math.max(...usedFragments.map((fragment) => fragment.confidence))
  const splitCents = cents !== null

  return {
    parsed,
    text,
    confidence,
    digitConfidence,
    bbox,
    centerX: bbox.x + bbox.width / 2,
    centerY: bbox.y + bbox.height / 2,
    layoutScore: scoreSplitLayout(symbol, integer, cents),
    splitCents,
    suspiciousIsolatedInteger: !splitCents && integerCandidates.length === 1 && centsCandidates.length > 0,
  }
}

/**
 * Builds price candidates from independently OCR'd spatial fragments.
 */
export function reconstructPriceCandidates(
  fragments: PriceFragment[],
  fallbackCurrency?: FiatCurrency,
): ReconstructedPriceCandidate[] {
  if (fragments.length === 0) return []

  const candidates: ReconstructedPriceCandidate[] = []
  const symbol = fragments.find((fragment) => fragmentLooksLikeCurrencySymbol(fragment.text)) ?? null
  const integerCandidates = fragments.filter((fragment) => fragmentLooksLikeInteger(fragment.text))
  const centsCandidates = fragments.filter((fragment) => fragmentLooksLikeCents(fragment.text))
  const hasConflictingCurrencySymbol =
    fallbackCurrency !== undefined &&
    fragments.some((fragment) => {
      const symbolCurrency = symbolCurrencyInText(fragment.text)
      return symbolCurrency !== null && symbolCurrency !== fallbackCurrency
    })
  const fallbackForGroup = (group: PriceFragment[]): FiatCurrency | undefined => {
    if (!hasConflictingCurrencySymbol || group.some(fragmentHasCurrencySymbol)) {
      return fallbackCurrency
    }
    return undefined
  }

  for (const integer of integerCandidates) {
    if (fragmentIsAtomicPriceRead(integer.text)) {
      const atomic = buildCandidateFromFragments([integer], fallbackForGroup([integer]))
      if (atomic && !candidates.some((existing) => existing.text === atomic.text)) {
        candidates.push(atomic)
      }
      continue
    }

    const nearbyCents = centsCandidates
      .filter(
        (cents) =>
          cents.bbox.x >= integer.bbox.x - 8 &&
          fragmentsAreSpatiallyRelated(integer, cents),
      )
      .sort((a, b) => a.bbox.x - b.bbox.x)[0]
    const splitDigitCents = nearbyCents ? null : buildCentsFromSingleDigitFragments(integer, fragments)

    const group = [
      integer,
      ...(nearbyCents ? [nearbyCents] : splitDigitCents ? [splitDigitCents] : []),
      ...(symbol && fragmentsAreSpatiallyRelated(symbol, integer) ? [symbol] : []),
    ]
    const candidate = buildCandidateFromFragments(group, fallbackForGroup(group))
    if (!candidate) continue
    if (candidates.some((existing) => existing.text === candidate.text)) continue
    candidates.push(candidate)
  }

  for (const fragment of fragments) {
    const single = buildCandidateFromFragments([fragment], fallbackForGroup([fragment]))
    if (!single) continue
    if (candidates.some((existing) => existing.text === single.text)) continue
    single.suspiciousIsolatedInteger =
      fragmentLooksLikeInteger(fragment.text) &&
      !fragmentLooksLikeCents(fragment.text) &&
      centsCandidates.some(
        (cents) =>
          fragmentsAreSpatiallyRelated(fragment, cents) &&
          integerCandidates.some((integer) => fragmentsAreSpatiallyRelated(integer, cents)),
      )
    candidates.push(single)
  }

  return candidates
}

export function markSuspiciousIsolatedIntegers(
  candidates: ReconstructedPriceCandidate[],
): ReconstructedPriceCandidate[] {
  const splitLayouts = candidates.filter((candidate) => candidate.splitCents)
  if (splitLayouts.length === 0) return candidates

  return candidates.map((candidate) => {
    if (candidate.splitCents) return candidate
    const isLargeInteger =
      Number.isInteger(candidate.parsed.amount) &&
      candidate.parsed.amount >= 100 &&
      !candidate.text.includes('.')
    if (!isLargeInteger) return candidate

    const nearbySplit = splitLayouts.some((split) => {
      const dx = candidate.centerX - split.centerX
      const dy = candidate.centerY - split.centerY
      return Math.hypot(dx, dy) < 120
    })

    if (!nearbySplit) return candidate
    return { ...candidate, suspiciousIsolatedInteger: true }
  })
}

export function comparePriceCandidates(
  left: ReconstructedPriceCandidate & { centerDistance?: number },
  right: ReconstructedPriceCandidate & { centerDistance?: number },
): number {
  if (left.suspiciousIsolatedInteger !== right.suspiciousIsolatedInteger) {
    return left.suspiciousIsolatedInteger ? 1 : -1
  }

  const leftCenter = left.centerDistance ?? Math.hypot(left.centerX, left.centerY)
  const rightCenter = right.centerDistance ?? Math.hypot(right.centerX, right.centerY)
  if (leftCenter !== rightCenter) {
    return leftCenter - rightCenter
  }

  if (left.layoutScore !== right.layoutScore) {
    return right.layoutScore - left.layoutScore
  }

  if (left.splitCents !== right.splitCents) {
    return left.splitCents ? -1 : 1
  }

  const leftScore = left.digitConfidence * 1000 + left.confidence
  const rightScore = right.digitConfidence * 1000 + right.confidence
  return rightScore - leftScore
}
