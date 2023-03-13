/* eslint-env jest */
import { detectContentType } from 'next/dist/server/image-optimizer'
import { readFile } from 'fs-extra'
import { join } from 'path'

const getImage = (filepath) => readFile(join(__dirname, filepath))

describe('detectContentType', () => {
  it('should return jpg', async () => {
    const buffer = await getImage('./images/test.jpg')
    expect(detectContentType(buffer)).toBe('image/jpeg')
  })
  it('should return png', async () => {
    const buffer = await getImage('./images/test.png')
    expect(detectContentType(buffer)).toBe('image/png')
  })
  it('should return webp', async () => {
    const buffer = await getImage('./images/animated.webp')
    expect(detectContentType(buffer)).toBe('image/webp')
  })
  it('should return svg', async () => {
    const buffer = await getImage('./images/test.svg')
    expect(detectContentType(buffer)).toBe('image/svg+xml')
  })
  it('should return avif', async () => {
    const buffer = await getImage('./images/test.avif')
    expect(detectContentType(buffer)).toBe('image/avif')
  })
  it('should return icon', async () => {
    const buffer = await getImage('./images/test.ico')
    expect(detectContentType(buffer)).toBe('image/x-icon')
  })
})
