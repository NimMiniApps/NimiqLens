import type { FiatCurrency } from './convert'
import { detectPrice, type DetectedPrice } from './priceDetection'
import {
  recognizeText,
  maxDigitWordConfidence,
  maxDigitWordArea,
  MIN_OCR_CONFIDENCE,
  type OcrResult,
} from './ocr'
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
): number {
  const baseScore = digitConfidence * 1000 + confidence
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
  const penalty = extraDigitChars * 5000 + alphaChars * 50 + Math.max(0, lineCount - 1) * 250

  const areaBonus = Math.min(50000, Math.round(digitWordArea * 10))
  return baseScore + areaBonus - penalty
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
      const { text, confidence, words } = await recognizeFn(variants[variantIndex])
      const digitConfidence = maxDigitWordConfidence(words)
      const digitWordArea = maxDigitWordArea(words)
      const parsed = detectPrice(text, scanCurrency)
      const accepted = digitConfidence >= MIN_OCR_CONFIDENCE && parsed !== null
      const score = accepted && parsed
        ? scoreAcceptedCandidate(text, confidence, digitConfidence, parsed, digitWordArea)
        : null

      if (accepted && parsed && score !== null) {
        const winner: OcrPipelineWinner = {
          cropIndex,
          variantIndex,
          parsed,
          score,
        }
        if (!bestWinner || score > bestWinner.score) {
          bestWinner = winner
        }
      }

      variantResults.push({
        index: variantIndex,
        mode: formatVariantMode(variantIndex),
        text,
        confidence,
        digitConfidence,
        parsed: accepted ? parsed : null,
        score,
        rejected: !accepted,
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
