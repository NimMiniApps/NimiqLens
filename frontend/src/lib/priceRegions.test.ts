import { describe, it, expect } from 'vitest'
import {
  buildForegroundMask,
  clusterCandidateRegions,
  cropCenterDistance,
  extractConnectedComponents,
  extractCandidateRegionsFromVariant,
  type CandidateRegion,
} from './priceRegions'

function makeMask(width: number, height: number, points: Array<[number, number]>): Uint8Array {
  const mask = new Uint8Array(width * height)
  for (const [x, y] of points) {
    mask[y * width + x] = 1
  }
  return mask
}

function regionAt(x: number, y: number, width: number, height: number, area: number): CandidateRegion {
  return {
    bbox: { x, y, width, height },
    centerX: x + width / 2,
    centerY: y + height / 2,
    area,
  }
}

describe('extractConnectedComponents', () => {
  it('turns connected foreground pixels into candidate regions', () => {
    const mask = makeMask(20, 10, [
      [2, 2], [3, 2], [4, 2],
      [2, 3], [3, 3], [4, 3],
      [12, 4], [13, 4], [14, 4], [15, 4], [16, 4],
    ])

    const regions = extractConnectedComponents(mask, 20, 10, 4)

    expect(regions).toHaveLength(2)
    expect(regions[0].area).toBe(6)
    expect(regions[1].area).toBe(5)
  })

  it('discards tiny noise regions below the minimum area', () => {
    const mask = makeMask(10, 10, [[1, 1], [2, 1], [5, 5]])

    const regions = extractConnectedComponents(mask, 10, 10, 2)

    expect(regions).toHaveLength(1)
    expect(regions[0].area).toBe(2)
  })
})

describe('cropCenterDistance', () => {
  it('ranks the center-most candidate closest to the target-box center', () => {
    const center = regionAt(45, 20, 10, 10, 100)
    const offCenter = regionAt(5, 5, 30, 30, 900)

    const centerDistance = cropCenterDistance(center, 100, 50)
    const offCenterDistance = cropCenterDistance(offCenter, 100, 50)

    expect(centerDistance).toBeLessThan(offCenterDistance)
  })
})

describe('clusterCandidateRegions', () => {
  it('merges horizontally adjacent components into one cluster', () => {
    const integer = regionAt(10, 10, 40, 30, 800)
    const cents = regionAt(55, 12, 16, 14, 120)

    const clusters = clusterCandidateRegions([integer, cents])

    expect(clusters).toHaveLength(1)
    expect(clusters[0].bbox.width).toBeGreaterThan(integer.bbox.width)
  })
})

describe('extractCandidateRegionsFromVariant', () => {
  it('extracts connected components from a thresholded canvas variant', () => {
    const canvas = document.createElement('canvas')
    canvas.width = 60
    canvas.height = 30
    const ctx = canvas.getContext('2d')
    ctx!.fillStyle = '#fff'
    ctx?.fillRect(0, 0, canvas.width, canvas.height)
    ctx!.fillStyle = '#000'
    ctx!.fillRect(20, 8, 18, 14)
    ctx!.fillRect(42, 10, 8, 8)

    const regions = extractCandidateRegionsFromVariant(canvas, 128)

    expect(regions.length).toBeGreaterThanOrEqual(2)
  })
})

describe('buildForegroundMask', () => {
  it('marks dark pixels as foreground by default', () => {
    const grayscale = new Uint8Array([10, 200])
    const mask = buildForegroundMask(grayscale, 2, 1, 128, true)

    expect([...mask]).toEqual([1, 0])
  })
})
