/* eslint-env jest */
import { detectContentType } from '../../../../packages/next/dist/server/image-optimizer.js'
import { readFile } from 'fs-extra'
import { join } from 'path'

const getImage = (filepath) => readFile(join(__dirname, filepath))

describe('detectContentType', () => {
  it('should return jpg', async () => {
    const buffer = await getImage('../app/public/test.jpg')
    expect(detectContentType(buffer)).toBe('image/jpeg')
  })
  it('should return png', async () => {
    const buffer = await getImage('../app/public/test.png')
    expect(detectContentType(buffer)).toBe('image/png')
  })
  it('should return webp', async () => {
    const buffer = await getImage('../app/public/animated.webp')
    expect(detectContentType(buffer)).toBe('image/webp')
  })
  it('should return svg', async () => {
    const buffer = await getImage('../app/public/test.svg')
    expect(detectContentType(buffer)).toBe('image/svg+xml')
  })
})
