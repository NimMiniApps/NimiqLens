import { describe, it, expect } from 'vitest'
import {
  parseFixtureRunnerArgs,
  buildFixtureReport,
  summarizeFixtureReport,
} from './ocr-fixture-runner.lib'
import type { OcrPipelineResult } from '../src/lib/ocrPipeline'

describe('parseFixtureRunnerArgs', () => {
  it('parses image paths, currency, artifacts dir, and json-only flag', () => {
    const args = parseFixtureRunnerArgs([
      './fixtures/ocr/example.jpg',
      '--currency',
      'USD',
      '--artifacts',
      './tmp/ocr-artifacts',
      '--json-only',
    ])

    expect(args).toEqual({
      imagePaths: ['./fixtures/ocr/example.jpg'],
      currency: 'USD',
      artifactsDir: './tmp/ocr-artifacts',
      jsonOnly: true,
    })
  })

  it('defaults currency to EUR when not provided', () => {
    expect(parseFixtureRunnerArgs(['image.jpg'])).toEqual({
      imagePaths: ['image.jpg'],
      currency: 'EUR',
      artifactsDir: null,
      jsonOnly: false,
    })
  })
})

describe('fixture report helpers', () => {
  const pipelineResult: OcrPipelineResult = {
    crops: [
      {
        index: 0,
        rect: { x: 0, y: 0, width: 100, height: 50 },
        variants: [
          {
            index: 0,
            mode: 'grayscale',
            text: '€3.99',
            confidence: 80,
            digitConfidence: 95,
            parsed: { amount: 3.99, currency: 'EUR' },
            score: 95080,
            rejected: false,
            regionCount: 2,
            candidateCount: 1,
          },
          {
            index: 1,
            mode: 'threshold:128',
            text: 'noise',
            confidence: 70,
            digitConfidence: 0,
            parsed: null,
            score: null,
            rejected: true,
          },
        ],
      },
    ],
    winner: {
      cropIndex: 0,
      variantIndex: 0,
      parsed: { amount: 3.99, currency: 'EUR' },
      score: 95080,
    },
  }

  it('builds a fixture report with winner metadata', () => {
    const report = buildFixtureReport('fixtures/ocr/example.jpg', 'EUR', pipelineResult)

    expect(report).toEqual({
      input: 'fixtures/ocr/example.jpg',
      currency: 'EUR',
      crops: pipelineResult.crops,
      winner: {
        cropIndex: 0,
        variantIndex: 0,
        parsed: { amount: 3.99, currency: 'EUR' },
      },
    })
  })

  it('summarizes accepted and rejected variant counts', () => {
    const report = buildFixtureReport('fixtures/ocr/example.jpg', 'EUR', pipelineResult)
    const summary = summarizeFixtureReport(report)

    expect(summary).toContain('Input: fixtures/ocr/example.jpg')
    expect(summary).toContain('Winner: 3.99 EUR')
    expect(summary).toContain('Best OCR text: €3.99')
    expect(summary).toContain('Regions OCR\'d: 2')
    expect(summary).toContain('Variants: 1 accepted, 1 rejected')
  })
})
