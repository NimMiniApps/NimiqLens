import type { FiatCurrency } from './convert'
import {
  detectPrice,
  comparePriceCandidates,
  markSuspiciousIsolatedIntegers,
  reconstructPriceCandidates,
  type DetectedPrice,
  type PriceFragment,
  type ReconstructedPriceCandidate,
} from './priceDetection'
import {
  recognizeText,
  maxDigitWordConfidence,
  maxDigitWordArea,
  MIN_OCR_CONFIDENCE,
  type OcrResult,
} from './ocr'
import * as priceRegions from './priceRegions'
import { VARIANT_MODES, type CropRect } from './scanImage'

export interface OcrVariantResult {
  index: number
  mode: string
  text: string
  confidence: number
  digitConfidence: number
  parsed: DetectedPrice | null
  score: number | null
  rejected: boolean
  regionCount?: number
  candidateCount?: number
}

export interface OcrCropResult {
  index: number
  rect: CropRect
  variants: OcrVariantResult[]
}

export interface OcrPipelineWinner {
  cropIndex: number
  variantIndex: number
  parsed: DetectedPrice
  score: number
  text: string
  centerDistance: number
}

export interface OcrPipelineResult {
  crops: OcrCropResult[]
  winner: OcrPipelineWinner | null
}

export interface CropWithVariants {
  rect: CropRect
  variants: HTMLCanvasElement[]
}

type RecognizeFn = (image: HTMLCanvasElement) => Promise<OcrResult>

const CENTER_DISTANCE_WEIGHT = 10000
const SUSPICIOUS_INTEGER_PENALTY = 500000

function formatVariantMode(index: number): string {
  const variant = VARIANT_MODES[index]
  if (!variant) return `unknown-${index}`
  if ('threshold' in variant) {
    return `${variant.mode}:${variant.threshold}`
  }
  return variant.mode
}

function buildParsedTokenPatterns(parsed: DetectedPrice): RegExp[] {
  const whole = Math.trunc(parsed.amount)
  const cents = Math.round((parsed.amount - whole) * 100)
  const fractional = `${whole}[.,]${String(cents).padStart(2, '0')}`
  const droppedSeparator = `${whole}\\s+${String(cents).padStart(2, '0')}`
  return [new RegExp(`\\b${fractional}\\b`), new RegExp(`\\b${droppedSeparator}\\b`)]
}

function scoreAcceptedCandidate(
  text: string,
  confidence: number,
  digitConfidence: number,
  parsed: DetectedPrice,
  digitWordArea: number,
  centerDistance: number,
  layoutScore = 0,
  suspiciousIsolatedInteger = false,
): number {
  const baseScore = digitConfidence * 1000 + confidence + layoutScore * 100
  const normalized = text.replace(/\s+/g, ' ').trim()
  const digitGroups = normalized.match(/\d+(?:[.,]\d+)?/g) ?? []
  const parsedPatterns = buildParsedTokenPatterns(parsed)
  const matchingIndex = digitGroups.findIndex((group) =>
    parsedPatterns.some((pattern) => pattern.test(group)),
  )

  const extraDigitChars = digitGroups.reduce((sum, group, index) => {
    if (index === matchingIndex) return sum
    return sum + group.replace(/[^\d]/g, '').length
  }, 0)

  const alphaChars = (normalized.match(/[A-Za-z]/g) ?? []).length
  const lineCount = text.split(/\n+/).filter((line) => line.trim().length > 0).length
  const penalty =
    extraDigitChars * 5000 +
    alphaChars * 50 +
    Math.max(0, lineCount - 1) * 250 +
    centerDistance * CENTER_DISTANCE_WEIGHT +
    (suspiciousIsolatedInteger ? SUSPICIOUS_INTEGER_PENALTY : 0)

  const areaBonus = Math.min(50000, Math.round(digitWordArea * 10))
  return baseScore + areaBonus - penalty
}

function toPriceFragment(
  region: priceRegions.CandidateRegion,
  ocr: OcrResult,
): PriceFragment & { digitWordArea: number } {
  return {
    text: ocr.text,
    confidence: ocr.confidence,
    digitConfidence: maxDigitWordConfidence(ocr.words),
    digitWordArea: maxDigitWordArea(ocr.words),
    bbox: region.bbox,
  }
}

function withCenterDistance(
  candidate: ReconstructedPriceCandidate,
  cropWidth: number,
  cropHeight: number,
): ReconstructedPriceCandidate & { centerDistance: number } {
  const centerDistance = Math.hypot(
    candidate.centerX - cropWidth / 2,
    candidate.centerY - cropHeight / 2,
  )
  return { ...candidate, centerDistance }
}

function pickBestCandidate(
  candidates: Array<ReconstructedPriceCandidate & { centerDistance: number }>,
): (ReconstructedPriceCandidate & { centerDistance: number }) | null {
  if (candidates.length === 0) return null
  return [...candidates].sort(comparePriceCandidates)[0]
}

async function recognizeRegions(
  variant: HTMLCanvasElement,
  regions: priceRegions.CandidateRegion[],
  recognizeFn: RecognizeFn,
): Promise<Array<PriceFragment & { digitWordArea: number }>> {
  const fragments: Array<PriceFragment & { digitWordArea: number }> = []

  for (const region of regions) {
    const regionCanvas = priceRegions.extractRegionCanvas(variant, region.bbox)
    const ocr = await recognizeFn(regionCanvas)
    fragments.push(toPriceFragment(region, ocr))
  }

  return fragments
}

async function recognizeClusterFragments(
  variant: HTMLCanvasElement,
  regions: priceRegions.CandidateRegion[],
  recognizeFn: RecognizeFn,
): Promise<Array<PriceFragment & { digitWordArea: number }>> {
  const fragments = await recognizeRegions(variant, regions, recognizeFn)
  const clusters = priceRegions
    .clusterCandidateRegions(regions)
    .sort(
      (left, right) =>
        priceRegions.cropCenterDistance(left, variant.width, variant.height) -
        priceRegions.cropCenterDistance(right, variant.width, variant.height),
    )

  for (const cluster of clusters) {
    const clusterCanvas = priceRegions.extractRegionCanvas(variant, cluster.bbox)
    const ocr = await recognizeFn(clusterCanvas)
    fragments.push({
      text: ocr.text,
      confidence: ocr.confidence,
      digitConfidence: maxDigitWordConfidence(ocr.words),
      digitWordArea: maxDigitWordArea(ocr.words),
      bbox: cluster.bbox,
    })
  }

  return fragments
}

function isPlausiblePriceCandidate(candidate: ReconstructedPriceCandidate): boolean {
  if (candidate.parsed.amount <= 0) return false
  if (
    candidate.parsed.amount < 2 &&
    !/[€$£¥₹]/.test(candidate.text) &&
    candidate.layoutScore < 30
  ) {
    return false
  }
  return true
}

function isSuspiciousFullCropInteger(
  parsed: DetectedPrice,
  text: string,
  regionCount: number,
): boolean {
  return (
    regionCount >= 3 &&
    Number.isInteger(parsed.amount) &&
    parsed.amount >= 100 &&
    !/[.,]\d{2}/.test(text)
  )
}

async function evaluateClusterDirectCandidates(
  variant: HTMLCanvasElement,
  regions: priceRegions.CandidateRegion[],
  scanCurrency: FiatCurrency,
  recognizeFn: RecognizeFn,
): Promise<(ReconstructedPriceCandidate & { centerDistance: number }) | null> {
  const clusters = priceRegions
    .clusterCandidateRegions(regions)
    .sort(
      (left, right) =>
        priceRegions.cropCenterDistance(left, variant.width, variant.height) -
        priceRegions.cropCenterDistance(right, variant.width, variant.height),
    )

  for (const cluster of clusters) {
    const clusterCanvas = priceRegions.extractRegionCanvas(variant, cluster.bbox)
    const ocr = await recognizeFn(clusterCanvas)
    const digitConfidence = maxDigitWordConfidence(ocr.words)
    if (digitConfidence < MIN_OCR_CONFIDENCE) continue

    const fragments: Array<PriceFragment & { digitWordArea: number }> = [{
      text: ocr.text,
      confidence: ocr.confidence,
      digitConfidence,
      digitWordArea: maxDigitWordArea(ocr.words),
      bbox: cluster.bbox,
    }]
    const candidates = markSuspiciousIsolatedIntegers(
      reconstructPriceCandidates(fragments, scanCurrency),
    ).map((candidate) => withCenterDistance(candidate, variant.width, variant.height))
    const best = pickBestCandidate(candidates)
    if (!best || best.suspiciousIsolatedInteger || !isPlausiblePriceCandidate(best)) continue
    if (isSuspiciousFullCropInteger(best.parsed, best.text, regions.length)) continue

    return best
  }

  return null
}

function bestDigitWordArea(
  candidate: ReconstructedPriceCandidate,
  fragments: Array<PriceFragment & { digitWordArea: number }>,
): number {
  const usedTexts = candidate.text.split(/\s+/).filter(Boolean)
  const matchedAreas = fragments
    .filter((fragment) => usedTexts.some((token) => fragment.text.includes(token) || token.includes(fragment.text.trim())))
    .map((fragment) => fragment.digitWordArea)
  if (matchedAreas.length === 0) {
    return candidate.bbox.width * candidate.bbox.height
  }
  return Math.max(...matchedAreas)
}

async function evaluateVariant(
  variant: HTMLCanvasElement,
  scanCurrency: FiatCurrency,
  recognizeFn: RecognizeFn,
): Promise<{
  text: string
  confidence: number
  digitConfidence: number
  parsed: DetectedPrice | null
  score: number | null
  rejected: boolean
  regionCount: number
  candidateCount: number
  winnerCandidate: (ReconstructedPriceCandidate & { centerDistance: number }) | null
}> {
  const rawRegions = priceRegions.extractCandidateRegionsFromVariant(variant)
  const regions = rawRegions.filter(
    (region) => region.area < variant.width * variant.height * 0.85,
  )

  if (regions.length === 0) {
    const fallbackOcr = await recognizeFn(variant)
    const fallbackDigitConfidence = maxDigitWordConfidence(fallbackOcr.words)
    const fallbackParsed = detectPrice(fallbackOcr.text, scanCurrency)
    const fallbackRegion = priceRegions.fullVariantRegion(variant)
    const fallbackCenterDistance = priceRegions.cropCenterDistance(
      fallbackRegion,
      variant.width,
      variant.height,
    )
    const accepted = fallbackDigitConfidence >= MIN_OCR_CONFIDENCE && fallbackParsed !== null
    const suspiciousFallback =
      accepted &&
      fallbackParsed &&
      isSuspiciousFullCropInteger(fallbackParsed, fallbackOcr.text, 0)
    const score =
      accepted && fallbackParsed && !suspiciousFallback
        ? scoreAcceptedCandidate(
            fallbackOcr.text,
            fallbackOcr.confidence,
            fallbackDigitConfidence,
            fallbackParsed,
            maxDigitWordArea(fallbackOcr.words),
            fallbackCenterDistance,
          )
        : null

    return {
      text: fallbackOcr.text,
      confidence: fallbackOcr.confidence,
      digitConfidence: fallbackDigitConfidence,
      parsed: accepted && !suspiciousFallback ? fallbackParsed : null,
      score,
      rejected: !accepted || suspiciousFallback,
      regionCount: 0,
      candidateCount: accepted && !suspiciousFallback ? 1 : 0,
      winnerCandidate:
        accepted && fallbackParsed && !suspiciousFallback
          ? {
              parsed: fallbackParsed,
              text: fallbackOcr.text,
              confidence: fallbackOcr.confidence,
              digitConfidence: fallbackDigitConfidence,
              bbox: fallbackRegion.bbox,
              centerX: fallbackRegion.centerX,
              centerY: fallbackRegion.centerY,
              layoutScore: 0,
              splitCents: false,
              suspiciousIsolatedInteger: false,
              centerDistance: fallbackCenterDistance,
            }
          : null,
    }
  }

  const fragments = await recognizeClusterFragments(variant, regions, recognizeFn)
  const reconstructed = markSuspiciousIsolatedIntegers(
    reconstructPriceCandidates(fragments, scanCurrency),
  ).map((candidate) => withCenterDistance(candidate, variant.width, variant.height))

  let bestCandidate = pickBestCandidate(reconstructed)
  let acceptedCandidate =
    bestCandidate &&
    bestCandidate.digitConfidence >= MIN_OCR_CONFIDENCE &&
    !bestCandidate.suspiciousIsolatedInteger &&
    isPlausiblePriceCandidate(bestCandidate)
      ? bestCandidate
      : null

  if (!acceptedCandidate) {
    const clusterCandidate = await evaluateClusterDirectCandidates(
      variant,
      regions,
      scanCurrency,
      recognizeFn,
    )
    if (clusterCandidate) {
      bestCandidate = clusterCandidate
      acceptedCandidate = clusterCandidate
    }
  }

  if (acceptedCandidate) {
    const score = scoreAcceptedCandidate(
      acceptedCandidate.text,
      acceptedCandidate.confidence,
      acceptedCandidate.digitConfidence,
      acceptedCandidate.parsed,
      bestDigitWordArea(acceptedCandidate, fragments),
      acceptedCandidate.centerDistance,
      acceptedCandidate.layoutScore,
      acceptedCandidate.suspiciousIsolatedInteger,
    )

    return {
      text: acceptedCandidate.text,
      confidence: acceptedCandidate.confidence,
      digitConfidence: acceptedCandidate.digitConfidence,
      parsed: acceptedCandidate.parsed,
      score,
      rejected: false,
      regionCount: regions.length,
      candidateCount: reconstructed.length,
      winnerCandidate: acceptedCandidate,
    }
  }

  return {
    text: fragments.map((fragment) => fragment.text.trim()).join(' ').trim(),
    confidence: 0,
    digitConfidence: 0,
    parsed: null,
    score: null,
    rejected: true,
    regionCount: regions.length,
    candidateCount: reconstructed.length,
    winnerCandidate: null,
  }
}

export async function runOcrPipeline(
  crops: CropWithVariants[],
  scanCurrency: FiatCurrency,
  recognizeFn: RecognizeFn = recognizeText,
): Promise<OcrPipelineResult> {
  const cropResults: OcrCropResult[] = []
  let bestWinner: OcrPipelineWinner | null = null

  for (let cropIndex = 0; cropIndex < crops.length; cropIndex += 1) {
    const { rect, variants } = crops[cropIndex]
    const variantResults: OcrVariantResult[] = []

    for (let variantIndex = 0; variantIndex < variants.length; variantIndex += 1) {
      const evaluation = await evaluateVariant(variants[variantIndex], scanCurrency, recognizeFn)

      if (evaluation.winnerCandidate && evaluation.score !== null && evaluation.parsed) {
        const winner: OcrPipelineWinner = {
          cropIndex,
          variantIndex,
          parsed: evaluation.parsed,
          score: evaluation.score,
          text: evaluation.text,
          centerDistance: evaluation.winnerCandidate.centerDistance,
        }

        if (
          !bestWinner ||
          evaluation.score > bestWinner.score ||
          (evaluation.score === bestWinner.score &&
            evaluation.winnerCandidate.centerDistance < bestWinner.centerDistance)
        ) {
          bestWinner = winner
        }
      }

      variantResults.push({
        index: variantIndex,
        mode: formatVariantMode(variantIndex),
        text: evaluation.text,
        confidence: evaluation.confidence,
        digitConfidence: evaluation.digitConfidence,
        parsed: evaluation.parsed,
        score: evaluation.score,
        rejected: evaluation.rejected,
        regionCount: evaluation.regionCount,
        candidateCount: evaluation.candidateCount,
      })
    }

    cropResults.push({
      index: cropIndex,
      rect,
      variants: variantResults,
    })
  }

  return { crops: cropResults, winner: bestWinner }
}
