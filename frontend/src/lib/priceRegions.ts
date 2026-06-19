import { extractCropFromCanvas, getGrayscaleFromCanvas, type CropRect } from './scanImage'

export interface RegionBBox {
  x: number
  y: number
  width: number
  height: number
}

export interface CandidateRegion {
  bbox: RegionBBox
  centerX: number
  centerY: number
  area: number
}

/** Minimum connected-component area in pixels — filters OCR noise specks. */
export const MIN_REGION_AREA = 20

/** Padding added around extracted region crops before OCR. */
export const REGION_CROP_PADDING = 2

/** Horizontal gap within which fragments may belong to the same price cluster. */
export const CLUSTER_MAX_HORIZONTAL_GAP = 24

/** Vertical distance within which fragments may belong to the same price cluster. */
export const CLUSTER_MAX_VERTICAL_GAP = 32

export function buildForegroundMask(
  grayscale: Uint8Array,
  width: number,
  height: number,
  threshold = 128,
  darkIsForeground = true,
): Uint8Array {
  const mask = new Uint8Array(width * height)
  for (let i = 0; i < grayscale.length; i += 1) {
    const isDark = grayscale[i] < threshold
    mask[i] = darkIsForeground ? (isDark ? 1 : 0) : (isDark ? 0 : 1)
  }
  return mask
}

export function extractConnectedComponents(
  mask: Uint8Array,
  width: number,
  height: number,
  minArea = MIN_REGION_AREA,
): CandidateRegion[] {
  if (mask.length !== width * height) return []

  const visited = new Uint8Array(width * height)
  const regions: CandidateRegion[] = []

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x
      if (mask[start] === 0 || visited[start] === 1) continue

      let minX = x
      let maxX = x
      let minY = y
      let maxY = y
      let area = 0
      let sumX = 0
      let sumY = 0

      const stack = [start]
      visited[start] = 1

      while (stack.length > 0) {
        const idx = stack.pop()!
        const px = idx % width
        const py = Math.floor(idx / width)
        area += 1
        sumX += px
        sumY += py
        minX = Math.min(minX, px)
        maxX = Math.max(maxX, px)
        minY = Math.min(minY, py)
        maxY = Math.max(maxY, py)

        const neighbors = [
          idx - 1,
          idx + 1,
          idx - width,
          idx + width,
        ]
        for (const next of neighbors) {
          if (next < 0 || next >= mask.length) continue
          if (Math.abs((next % width) - px) > 1) continue
          if (mask[next] === 0 || visited[next] === 1) continue
          visited[next] = 1
          stack.push(next)
        }
      }

      if (area < minArea) continue

      regions.push({
        bbox: {
          x: minX,
          y: minY,
          width: maxX - minX + 1,
          height: maxY - minY + 1,
        },
        centerX: sumX / area,
        centerY: sumY / area,
        area,
      })
    }
  }

  return regions
}

export function cropCenterDistance(
  region: CandidateRegion,
  cropWidth: number,
  cropHeight: number,
): number {
  const targetCenterX = cropWidth / 2
  const targetCenterY = cropHeight / 2
  const dx = region.centerX - targetCenterX
  const dy = region.centerY - targetCenterY
  return Math.hypot(dx, dy)
}

function countForegroundPixels(mask: Uint8Array): number {
  let count = 0
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i] === 1) count += 1
  }
  return count
}

function chooseMaskPolarity(
  grayscale: Uint8Array,
  width: number,
  height: number,
  threshold: number,
): Uint8Array {
  const darkMask = buildForegroundMask(grayscale, width, height, threshold, true)
  const lightMask = buildForegroundMask(grayscale, width, height, threshold, false)
  const darkCount = countForegroundPixels(darkMask)
  const lightCount = countForegroundPixels(lightMask)

  if (darkCount === 0) return lightMask
  if (lightCount === 0) return darkMask

  const total = width * height
  const darkRatio = darkCount / total
  const lightRatio = lightCount / total

  if (darkRatio > 0.65 || lightRatio > 0.65) {
    return darkRatio < lightRatio ? darkMask : lightMask
  }

  return darkCount <= lightCount ? darkMask : lightMask
}

export function extractCandidateRegionsFromVariant(
  variant: HTMLCanvasElement,
  threshold = 128,
): CandidateRegion[] {
  const grayscale = getGrayscaleFromCanvas(variant)
  if (grayscale.length === 0) return []

  const mask = chooseMaskPolarity(grayscale, variant.width, variant.height, threshold)
  return extractConnectedComponents(mask, variant.width, variant.height)
}

export function mergeRegionBboxes(regions: CandidateRegion[]): RegionBBox {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const region of regions) {
    minX = Math.min(minX, region.bbox.x)
    minY = Math.min(minY, region.bbox.y)
    maxX = Math.max(maxX, region.bbox.x + region.bbox.width)
    maxY = Math.max(maxY, region.bbox.y + region.bbox.height)
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

export function mergedRegionCenter(regions: CandidateRegion[]): { centerX: number; centerY: number } {
  let totalArea = 0
  let sumX = 0
  let sumY = 0

  for (const region of regions) {
    totalArea += region.area
    sumX += region.centerX * region.area
    sumY += region.centerY * region.area
  }

  if (totalArea === 0) {
    const bbox = mergeRegionBboxes(regions)
    return {
      centerX: bbox.x + bbox.width / 2,
      centerY: bbox.y + bbox.height / 2,
    }
  }

  return { centerX: sumX / totalArea, centerY: sumY / totalArea }
}

function horizontalGap(a: RegionBBox, b: RegionBBox): number {
  if (a.x + a.width < b.x) return b.x - (a.x + a.width)
  if (b.x + b.width < a.x) return a.x - (b.x + b.width)
  return 0
}

function verticalGap(a: RegionBBox, b: RegionBBox): number {
  if (a.y + a.height < b.y) return b.y - (a.y + a.height)
  if (b.y + b.height < a.y) return a.y - (b.y + b.height)
  return 0
}

function regionsAreClusterNeighbors(a: CandidateRegion, b: CandidateRegion): boolean {
  return (
    horizontalGap(a.bbox, b.bbox) <= CLUSTER_MAX_HORIZONTAL_GAP &&
    verticalGap(a.bbox, b.bbox) <= CLUSTER_MAX_VERTICAL_GAP
  )
}

export function clusterCandidateRegions(regions: CandidateRegion[]): CandidateRegion[] {
  if (regions.length === 0) return []

  const sorted = [...regions].sort((a, b) => a.bbox.x - b.bbox.x || a.bbox.y - b.bbox.y)
  const groups: CandidateRegion[][] = []

  for (const region of sorted) {
    let assigned = false
    for (const group of groups) {
      if (group.some((member) => regionsAreClusterNeighbors(member, region))) {
        group.push(region)
        assigned = true
        break
      }
    }
    if (!assigned) groups.push([region])
  }

  return groups.map((group) => {
    if (group.length === 1) return group[0]
    const bbox = mergeRegionBboxes(group)
    const { centerX, centerY } = mergedRegionCenter(group)
    return {
      bbox,
      centerX,
      centerY,
      area: group.reduce((sum, region) => sum + region.area, 0),
    }
  })
}

export function extractRegionCanvas(
  source: HTMLCanvasElement,
  bbox: RegionBBox,
  padding = REGION_CROP_PADDING,
): HTMLCanvasElement {
  const rect: CropRect = {
    x: Math.max(0, bbox.x - padding),
    y: Math.max(0, bbox.y - padding),
    width: Math.min(source.width - Math.max(0, bbox.x - padding), bbox.width + padding * 2),
    height: Math.min(source.height - Math.max(0, bbox.y - padding), bbox.height + padding * 2),
  }

  rect.width = Math.min(rect.width, source.width - rect.x)
  rect.height = Math.min(rect.height, source.height - rect.y)

  return extractCropFromCanvas(source, rect)
}

export function fullVariantRegion(variant: HTMLCanvasElement): CandidateRegion {
  return {
    bbox: { x: 0, y: 0, width: variant.width, height: variant.height },
    centerX: variant.width / 2,
    centerY: variant.height / 2,
    area: variant.width * variant.height,
  }
}
