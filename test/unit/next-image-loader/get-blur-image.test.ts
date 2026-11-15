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
})
