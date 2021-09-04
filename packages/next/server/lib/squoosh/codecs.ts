import { promises as fsp } from 'fs'
import * as path from 'path'
import { instantiateEmscriptenWasm, pathify } from './emscripten-utils.js'

// MozJPEG
// @ts-ignore
import mozEnc from './mozjpeg/mozjpeg_node_enc.js'
const mozEncWasm = path.resolve(__dirname, './mozjpeg/mozjpeg_node_enc.wasm')
// @ts-ignore
import mozDec from './mozjpeg/mozjpeg_node_dec.js'
const mozDecWasm = path.resolve(__dirname, './mozjpeg/mozjpeg_node_dec.wasm')

// WebP
// @ts-ignore
import webpEnc from './webp/webp_node_enc.js'
const webpEncWasm = path.resolve(__dirname, './webp/webp_node_enc.wasm')
// @ts-ignore
import webpDec from './webp/webp_node_dec.js'
const webpDecWasm = path.resolve(__dirname, './webp/webp_node_dec.wasm')

// PNG
// @ts-ignore
import * as pngEncDec from './png/squoosh_png.js'
const pngEncDecWasm = path.resolve(__dirname, './png/squoosh_png_bg.wasm')
const pngEncDecInit = () =>
  pngEncDec.default(fsp.readFile(pathify(pngEncDecWasm)))

// OxiPNG
// @ts-ignore
import * as oxipng from './png/squoosh_oxipng.js'
const oxipngWasm = path.resolve(__dirname, './png/squoosh_oxipng_bg.wasm')
const oxipngInit = () => oxipng.default(fsp.readFile(pathify(oxipngWasm)))

// Resize
// @ts-ignore
import * as resize from './resize/squoosh_resize.js'
const resizeWasm = path.resolve(__dirname, './resize/squoosh_resize_bg.wasm')
const resizeInit = () => resize.default(fsp.readFile(pathify(resizeWasm)))

// rotate
const rotateWasm = path.resolve(__dirname, './rotate/rotate.wasm')

import ImageData from './image_data.js'
;(global as any).ImageData = ImageData // mandatory for wasm binaries

function resizeNameToIndex(
  name: 'triangle' | 'catrom' | 'mitchell' | 'lanczos3'
) {
  switch (name) {
    case 'triangle':
      return 0
    case 'catrom':
      return 1
    case 'mitchell':
      return 2
    case 'lanczos3':
      return 3
    default:
      throw Error(`Unknown resize algorithm "${name}"`)
  }
}

function resizeWithAspect({
  input_width,
  input_height,
  target_width,
  target_height,
}: {
  input_width: number
  input_height: number
  target_width?: number
  target_height?: number
}): { width: number; height: number } {
  if (!target_width && !target_height) {
    throw Error('Need to specify at least width or height when resizing')
  }
  if (target_width && target_height) {
    return { width: target_width, height: target_height }
  }
  if (!target_width) {
    return {
      width: Math.round((input_width / input_height) * target_height!),
      height: target_height!,
    }
  }
  if (!target_height) {
    return {
      width: target_width,
      height: Math.round((input_height / input_width) * target_width),
    }
  }
  throw Error('invariant')
}

export const preprocessors = {
  resize: {
    name: 'Resize',
    description: 'Resize the image before compressing',
    instantiate: async () => {
      await resizeInit()
      return (
        buffer: Buffer | Uint8Array,
        input_width: number,
        input_height: number,
        {
          width,
          height,
          method,
          premultiply,
          linearRGB,
        }: {
          width?: number
          height?: number
          method: 'triangle' | 'catrom' | 'mitchell' | 'lanczos3'
          premultiply: boolean
          linearRGB: boolean
        }
      ) => {
        ;({ width, height } = resizeWithAspect({
          input_width,
          input_height,
          target_width: width,
          target_height: height,
        }))
        const imageData = new ImageData(
          resize.resize(
            buffer,
            input_width,
            input_height,
            width,
            height,
            resizeNameToIndex(method),
            premultiply,
            linearRGB
          ),
          width,
          height
        )
        resize.cleanup()
        return imageData
      }
    },
    defaultOptions: {
      method: 'lanczos3',
      fitMethod: 'stretch',
      premultiply: true,
      linearRGB: true,
    },
  },
  rotate: {
    name: 'Rotate',
    description: 'Rotate image',
    instantiate: async () => {
      return async (
        buffer: Buffer | Uint8Array,
        width: number,
        height: number,
        { numRotations }: { numRotations: number }
      ) => {
        const degrees = (numRotations * 90) % 360
        const sameDimensions = degrees === 0 || degrees === 180
        const size = width * height * 4
        const { instance } = await WebAssembly.instantiate(
          await fsp.readFile(pathify(rotateWasm))
        )
        const exports = instance.exports as any
        const { memory } = exports
        const additionalPagesNeeded = Math.ceil(
          (size * 2 - memory.buffer.byteLength + 8) / (64 * 1024)
        )
        if (additionalPagesNeeded > 0) {
          memory.grow(additionalPagesNeeded)
        }
        const view = new Uint8ClampedArray(memory.buffer)
        view.set(buffer, 8)
        exports.rotate(width, height, degrees)
        return new ImageData(
          Buffer.from(view.slice(size + 8, size * 2 + 8)),
          sameDimensions ? width : height,
          sameDimensions ? height : width
        )
      }
    },
    defaultOptions: {
      numRotations: 0,
    },
  },
} as const

export const codecs = {
  mozjpeg: {
    name: 'MozJPEG',
    extension: 'jpg',
    detectors: [/^\xFF\xD8\xFF/],
    dec: () => instantiateEmscriptenWasm(mozDec, mozDecWasm),
    enc: () => instantiateEmscriptenWasm(mozEnc, mozEncWasm),
    defaultEncoderOptions: {
      quality: 75,
      baseline: false,
      arithmetic: false,
      progressive: true,
      optimize_coding: true,
      smoothing: 0,
      color_space: 3 /*YCbCr*/,
      quant_table: 3,
      trellis_multipass: false,
      trellis_opt_zero: false,
      trellis_opt_table: false,
      trellis_loops: 1,
      auto_subsample: true,
      chroma_subsample: 2,
      separate_chroma_quality: false,
      chroma_quality: 75,
    },
    autoOptimize: {
      option: 'quality',
      min: 0,
      max: 100,
    },
  },
  webp: {
    name: 'WebP',
    extension: 'webp',
    detectors: [/^RIFF....WEBPVP8[LX ]/],
    dec: () => instantiateEmscriptenWasm(webpDec, webpDecWasm),
    enc: () => instantiateEmscriptenWasm(webpEnc, webpEncWasm),
    defaultEncoderOptions: {
      quality: 75,
      target_size: 0,
      target_PSNR: 0,
      method: 4,
      sns_strength: 50,
      filter_strength: 60,
      filter_sharpness: 0,
      filter_type: 1,
      partitions: 0,
      segments: 4,
      pass: 1,
      show_compressed: 0,
      preprocessing: 0,
      autofilter: 0,
      partition_limit: 0,
      alpha_compression: 1,
      alpha_filtering: 1,
      alpha_quality: 100,
      lossless: 0,
      exact: 0,
      image_hint: 0,
      emulate_jpeg_size: 0,
      thread_level: 0,
      low_memory: 0,
      near_lossless: 100,
      use_delta_palette: 0,
      use_sharp_yuv: 0,
    },
    autoOptimize: {
      option: 'quality',
      min: 0,
      max: 100,
    },
  },
  oxipng: {
    name: 'OxiPNG',
    extension: 'png',
    // eslint-disable-next-line no-control-regex
    detectors: [/^\x89PNG\x0D\x0A\x1A\x0A/],
    dec: async () => {
      await pngEncDecInit()
      return {
        decode: (buffer: Buffer | Uint8Array): Buffer => {
          const imageData = pngEncDec.decode(buffer)
          pngEncDec.cleanup()
          return imageData
        },
      } as any
    },
    enc: async () => {
      await pngEncDecInit()
      await oxipngInit()
      return {
        encode: (
          buffer: Buffer | Uint8Array,
          width: number,
          height: number,
          opts: any
        ) => {
          const simplePng = pngEncDec.encode(
            new Uint8Array(buffer),
            width,
            height
          )
          const imageData = oxipng.optimise(simplePng, opts.level)
          oxipng.cleanup()
          return imageData
        },
      }
    },
    defaultEncoderOptions: {
      level: 2,
    },
    autoOptimize: {
      option: 'level',
      min: 6,
      max: 1,
    },
  },
} as const
