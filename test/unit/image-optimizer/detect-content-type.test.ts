/* eslint-env jest */
import { detectContentType as dct } from 'next/dist/server/image-optimizer/detect-content-type'
import { readFile } from 'fs-extra'
import { join } from 'path'

const getImage = (filepath: string) => readFile(join(__dirname, filepath))

const detectContentType = async (buffer: Buffer, attempt = 0) => {
  let maxBlockedMs = 0
  let lastTick = performance.now()
  let running = true
  const sample = () => {
    const now = performance.now()
    maxBlockedMs = Math.max(maxBlockedMs, now - lastTick)
    lastTick = now
    if (running) {
      setImmediate(sample)
    }
  }
  setImmediate(sample)

  const result = await dct(buffer)

  running = false
  maxBlockedMs = Math.max(maxBlockedMs, performance.now() - lastTick)

  if (maxBlockedMs > 1) {
    // The sampled gaps also include JIT warmup and scheduler noise; a real
    // regression (GHSA-q8wf-6r8g-63ch) fails every attempt.
    if (attempt >= 4) {
      throw new Error(
        `detectContentType blocked the event loop for ${maxBlockedMs.toFixed(1)}ms`
      )
    } else {
      return await detectContentType(buffer, attempt + 1)
    }
  }
  return result
}

describe('detectContentType', () => {
  it('should return null for empty buffer', async () => {
    expect(await detectContentType(Buffer.alloc(0))).toBe(null)
  })
  it('should return null for unrecognized buffer', async () => {
    expect(await detectContentType(Buffer.from([0xa, 0xb, 0xc]))).toBe(null)
  })
  it('should return null for over 50MB of whitespace', async () => {
    const buffer = Buffer.alloc(50_000_001).fill(' ')
    expect(await detectContentType(buffer)).toBe(null)
  })
  it.each([
    ['html', '/test.html'],
    ['ppm', '/test.ppm'],
    ['pgm', '/test.pgm'],
    ['pam', '/test.pam'],
    ['pfm', '/test.pfm'],
    ['csv', '/test.csv'],
    ['vips', '/test.vips'],
    ['hdr', '/test.hdr'],
    ['exr', '/test.exr'],
    ['fits', '/test.fits'],
    ['j2c', '/test.j2c'],
    ['psd', '/test.psd'],
    ['tga', '/test.tga'],
    ['cur', '/test.cur'],
    ['dds', '/test.dds'],
    ['ktx', '/test.ktx'],
  ])(
    'should not allow %s because detectContentType returns null',
    async (_name, filename) => {
      const buffer = await getImage(
        `../../../test/e2e/image-optimizer/app/public${filename}`
      )
      console.log('has buffer', buffer.length)
      expect(await detectContentType(buffer)).toBe(null)
    }
  )
  it('should return jpg', async () => {
    const buffer = await getImage('./images/test.jpg')
    expect(await detectContentType(buffer)).toBe('image/jpeg')
  })
  it('should return png', async () => {
    const buffer = await getImage('./images/test.png')
    expect(await detectContentType(buffer)).toBe('image/png')
  })
  it('should return gif', async () => {
    const buffer = await getImage('./images/test.gif')
    expect(await detectContentType(buffer)).toBe('image/gif')
  })
  it('should return webp', async () => {
    const buffer = await getImage('./images/animated.webp')
    expect(await detectContentType(buffer)).toBe('image/webp')
  })
  it('should return svg', async () => {
    const buffer = await getImage('./images/test.svg')
    expect(await detectContentType(buffer)).toBe('image/svg+xml')
  })
  it('should return svg for inline svg', async () => {
    const buffer = await getImage('./images/test-inline.svg')
    expect(await detectContentType(buffer)).toBe('image/svg+xml')
  })
  it('should return svg for slow svg', async () => {
    const buffer = await getImage('./images/slow.svg.txt')
    expect(await detectContentType(buffer)).toBe('image/svg+xml')
  })
  it('should return avif', async () => {
    const buffer = await getImage('./images/test.avif')
    expect(await detectContentType(buffer)).toBe('image/avif')
  })
  it('should return icon', async () => {
    const buffer = await getImage('./images/test.ico')
    expect(await detectContentType(buffer)).toBe('image/x-icon')
  })
  it('should return icns', async () => {
    const buffer = await getImage('./images/test.icns')
    expect(await detectContentType(buffer)).toBe('image/x-icns')
  })
  it('should return jxl', async () => {
    const buffer = await getImage('./images/test.jxl')
    expect(await detectContentType(buffer)).toBe('image/jxl')
  })
  it('should return jp2', async () => {
    const buffer = await getImage('./images/test.jp2')
    expect(await detectContentType(buffer)).toBe('image/jp2')
  })
  it('should return heic', async () => {
    const buffer = await getImage('./images/test.heic')
    expect(await detectContentType(buffer)).toBe('image/heic')
  })
  it('should return pdf', async () => {
    const buffer = await getImage('./images/test.pdf')
    expect(await detectContentType(buffer)).toBe('application/pdf')
  })
  it('should return tiff', async () => {
    const buffer = await getImage('./images/test.tiff')
    expect(await detectContentType(buffer)).toBe('image/tiff')
  })
  it('should return bmp', async () => {
    const buffer = await getImage('./images/test.bmp')
    expect(await detectContentType(buffer)).toBe('image/bmp')
  })
})
