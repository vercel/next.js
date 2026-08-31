/* eslint-env jest */
import { getBlurImage } from 'next/dist/build/webpack/loaders/next-image-loader/blur'
import { readFile } from 'fs-extra'
import { join } from 'path'

const getImage = (filepath) => readFile(join(__dirname, filepath))

const tracing = () => ({
  traceFn: (fn, ...args) => fn(...args),
  traceAsyncFn: (fn, ...args) => fn(...args),
})

const context = { basePath: '', outputPath: '', isDev: false, tracing }

describe('getBlurImage', () => {
  it('should return image for jpg', async () => {
    const buffer = await getImage('./images/test.jpg')
    const result = await getBlurImage(
      buffer,
      'jpeg',
      { width: 400, height: 400 },
      context
    )
    expect(result).toBeObject()
    expect(result.dataURL).toBeString()
  })
  it('should return undefined for animated webp', async () => {
    const buffer = await getImage('./images/animated.webp')
    const result = await getBlurImage(
      buffer,
      'webp',
      { width: 400, height: 400 },
      context
    )
    expect(result).toBeObject()
    expect(result.dataURL).toBeUndefined()
  })
  it('should generate a blur placeholder for avif only when the decoder is patched', async () => {
    const buffer = await getImage('../image-optimizer/images/test.avif')
    const result = await getBlurImage(
      buffer,
      'avif',
      { width: 400, height: 400 },
      {
        ...context,
        outputPath: '/_next/static/media/test.avif',
      }
    )
    expect(result).toBeObject()
    // CI runs this on Node 18 with sharp 0.34.3 (vulnerable libheif, so AVIF
    // decoding is blocked) and on Node 20 with the lockfile's patched
    // libheif.
    if (process.version.startsWith('v18')) {
      expect(result).toStrictEqual({
        dataURL: undefined,
        width: 0,
        height: 0,
      })
    } else {
      expect(result.dataURL).toBeString()
      expect(result.width).toBe(8)
      expect(result.height).toBe(8)
    }
  })
})
