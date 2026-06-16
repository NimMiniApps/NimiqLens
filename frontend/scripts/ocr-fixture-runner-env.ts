import { createCanvas } from 'canvas'
import { setCanvasFactory } from '../src/lib/scanImage'

setCanvasFactory((width = 1, height = 1) => createCanvas(width, height) as unknown as HTMLCanvasElement)
