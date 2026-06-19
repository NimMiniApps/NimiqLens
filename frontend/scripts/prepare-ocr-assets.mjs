import { createWriteStream } from 'node:fs'
import { copyFile, mkdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import https from 'node:https'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const publicOcr = join(root, 'public', 'ocr')
const coreTarget = join(publicOcr, 'core')
const langTarget = join(publicOcr, 'lang')

const copies = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core.wasm.js', 'core/tesseract-core.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'core/tesseract-core-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd.wasm.js', 'core/tesseract-core-simd.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'core/tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-relaxedsimd.wasm.js', 'core/tesseract-core-relaxedsimd.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'core/tesseract-core-relaxedsimd-lstm.wasm.js'],
]

const languageUrl = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'
const languageTarget = join(langTarget, 'eng.traineddata.gz')

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function download(url, target) {
  await mkdir(dirname(target), { recursive: true })
  await new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Downloading ${url} failed with status ${response.statusCode}`))
        response.resume()
        return
      }

      const file = createWriteStream(target)
      response.pipe(file)
      file.on('finish', () => {
        file.close(resolve)
      })
      file.on('error', reject)
    }).on('error', reject)
  })
}

await mkdir(coreTarget, { recursive: true })
await mkdir(langTarget, { recursive: true })

for (const [source, target] of copies) {
  await copyFile(join(root, source), join(publicOcr, target))
}

if (!(await exists(languageTarget))) {
  await download(languageUrl, languageTarget)
}
