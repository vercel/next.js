/* eslint-env jest */
import { detectContentType } from '../../../../packages/next/dist/server/image-optimizer.js'
import { readFile } from 'fs/promises'
import { join } from 'path'

const getImage = (filepath) => readFile(join(__dirname, filepath))

describe('detectContentType', () => {
  it('should return jpg', async () => {
    const buffer = await getImage('../public/test.jpg')
    expect(detectContentType(buffer)).toBe('image/jpeg')
  })
  it('should return png', async () => {
    const buffer = await getImage('../public/test.png')
    expect(detectContentType(buffer)).toBe('image/png')
  })
  it('should return webp', async () => {
    const buffer = await getImage('../public/animated.webp')
    expect(detectContentType(buffer)).toBe('image/webp')
  })
  it('should return svg', async () => {
    const buffer = await getImage('../public/test.svg')
    expect(detectContentType(buffer)).toBe('image/svg+xml')
  })
})
