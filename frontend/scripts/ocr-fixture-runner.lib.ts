import type { FiatCurrency } from '../src/lib/convert'
import type { CropWithVariants, OcrPipelineResult } from '../src/lib/ocrPipeline'

export interface ParsedFixtureArgs {
  imagePaths: string[]
  currency: FiatCurrency
  artifactsDir: string | null
  jsonOnly: boolean
}

export interface FixtureReport {
  input: string
  currency: FiatCurrency
  crops: OcrPipelineResult['crops']
  winner: {
    cropIndex: number
    variantIndex: number
    parsed: NonNullable<OcrPipelineResult['winner']>['parsed']
  } | null
}

export function parseFixtureRunnerArgs(argv: string[]): ParsedFixtureArgs {
  const imagePaths: string[] = []
  let currency: FiatCurrency = 'EUR'
  let artifactsDir: string | null = null
  let jsonOnly = false

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--currency') {
      currency = argv[++i] as FiatCurrency
      continue
    }
    if (arg === '--artifacts') {
      artifactsDir = argv[++i]
      continue
    }
    if (arg === '--json-only') {
      jsonOnly = true
      continue
    }
    if (!arg.startsWith('-')) {
      imagePaths.push(arg)
    }
  }

  return { imagePaths, currency, artifactsDir, jsonOnly }
}

export function buildFixtureReport(
  inputPath: string,
  currency: FiatCurrency,
  result: OcrPipelineResult,
): FixtureReport {
  return {
    input: inputPath,
    currency,
    crops: result.crops,
    winner: result.winner
      ? {
          cropIndex: result.winner.cropIndex,
          variantIndex: result.winner.variantIndex,
          parsed: result.winner.parsed,
        }
      : null,
  }
}

export function summarizeFixtureReport(report: FixtureReport): string {
  const accepted = report.crops.reduce(
    (sum, crop) => sum + crop.variants.filter((variant) => !variant.rejected).length,
    0,
  )
  const rejected = report.crops.reduce(
    (sum, crop) => sum + crop.variants.filter((variant) => variant.rejected).length,
    0,
  )

  const winnerText = report.winner
    ? `${report.winner.parsed.amount} ${report.winner.parsed.currency}`
    : 'none'
  const winnerVariant = report.winner
    ? report.crops[report.winner.cropIndex]?.variants[report.winner.variantIndex]
    : null

  return [
    `Input: ${report.input}`,
    `Currency: ${report.currency}`,
    `Winner: ${winnerText}`,
    `Best OCR text: ${winnerVariant?.text.trim() ?? 'n/a'}`,
    `Variants: ${accepted} accepted, ${rejected} rejected`,
  ].join('\n')
}

export interface ArtifactWriteResult {
  directory: string
  cropFiles: string[]
  variantFiles: string[]
  reportFile: string
}

export async function writeFixtureArtifacts(
  artifactsDir: string,
  inputPath: string,
  rawCrops: HTMLCanvasElement[],
  pipelineCrops: CropWithVariants[],
  report: FixtureReport,
  writePng: (canvas: HTMLCanvasElement, path: string) => Promise<void>,
  mkdir: (path: string) => Promise<void>,
  writeFile: (path: string, data: string) => Promise<void>,
): Promise<ArtifactWriteResult> {
  const baseName = inputPath.replace(/[/\\]/g, '_').replace(/\.[^.]+$/, '')
  const directory = `${artifactsDir}/${baseName}`
  await mkdir(directory)

  const cropFiles: string[] = []
  const variantFiles: string[] = []

  for (let cropIndex = 0; cropIndex < rawCrops.length; cropIndex += 1) {
    const cropPath = `${directory}/crop-${cropIndex}.png`
    await writePng(rawCrops[cropIndex], cropPath)
    cropFiles.push(cropPath)
  }

  for (let cropIndex = 0; cropIndex < pipelineCrops.length; cropIndex += 1) {
    const crop = pipelineCrops[cropIndex]
    for (let variantIndex = 0; variantIndex < crop.variants.length; variantIndex += 1) {
      const variantPath = `${directory}/crop-${cropIndex}-variant-${variantIndex}.png`
      await writePng(crop.variants[variantIndex], variantPath)
      variantFiles.push(variantPath)
    }
  }

  const reportFile = `${directory}/report.json`
  await writeFile(reportFile, JSON.stringify(report, null, 2))

  return { directory, cropFiles, variantFiles, reportFile }
}
