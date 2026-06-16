import './ocr-fixture-runner-env'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createCanvas, loadImage, type Canvas } from 'canvas'
import { prepareOcrWorker, terminateOcrWorker } from '../src/lib/ocr'
import { runOcrPipeline } from '../src/lib/ocrPipeline'
import {
  getCropsFromStaticImage,
  getPreprocessedCropsFromStaticImage,
} from '../src/lib/scanImage'
import {
  buildFixtureReport,
  parseFixtureRunnerArgs,
  summarizeFixtureReport,
  writeFixtureArtifacts,
} from './ocr-fixture-runner.lib'

async function loadImageToCanvas(path: string): Promise<HTMLCanvasElement> {
  const image = await loadImage(path)
  const canvas = createCanvas(image.width, image.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Failed to create canvas context')
  }
  ctx.drawImage(image, 0, 0)
  return canvas as unknown as HTMLCanvasElement
}

async function writeCanvasPng(canvas: HTMLCanvasElement, path: string): Promise<void> {
  const nodeCanvas = canvas as unknown as Canvas
  await writeFile(path, nodeCanvas.toBuffer('image/png'))
}

async function main() {
  const args = parseFixtureRunnerArgs(process.argv.slice(2))

  if (args.imagePaths.length === 0) {
    console.error(
      'Usage: npm run ocr:fixture -- <image> [more images] [--currency EUR] [--artifacts <dir>] [--json-only]',
    )
    process.exit(1)
  }

  await prepareOcrWorker()

  try {
    for (const imagePath of args.imagePaths) {
      const resolved = resolve(imagePath)
      const canvas = await loadImageToCanvas(resolved)
      const rawCrops = getCropsFromStaticImage(canvas).map((entry) => entry.crop)
      const pipelineCrops = getPreprocessedCropsFromStaticImage(canvas)
      const result = await runOcrPipeline(pipelineCrops, args.currency)
      const report = buildFixtureReport(imagePath, args.currency, result)

      if (args.artifactsDir) {
        const artifactResult = await writeFixtureArtifacts(
          args.artifactsDir,
          imagePath,
          rawCrops,
          pipelineCrops,
          report,
          writeCanvasPng,
          async (dir) => {
            await mkdir(dir, { recursive: true })
          },
          async (path, data) => {
            await writeFile(path, data)
          },
        )
        if (!args.jsonOnly) {
          console.log(`Artifacts: ${artifactResult.directory}`)
        }
      }

      if (args.jsonOnly) {
        console.log(JSON.stringify(report))
      } else {
        console.log(summarizeFixtureReport(report))
        console.log(JSON.stringify(report, null, 2))
        console.log('')
      }
    }
  } finally {
    await terminateOcrWorker()
  }
}

void main()
