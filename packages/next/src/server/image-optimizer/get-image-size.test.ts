import { getImageSize } from './get-image-size'

describe('getImageSize', () => {
  it('measures an SVG whose <svg> root is preceded by a large XML/comment/DOCTYPE preamble (#71810)', async () => {
    const svg = Buffer.from(
      `<?xml version="1.0" encoding="utf-8"?>\n` +
        // A preamble large enough to push `<svg` past image-size's detection
        // window (e.g. Illustrator's comments + DOCTYPE entity declarations).
        `<!-- ${'x'.repeat(2048)} -->\n` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 200"></svg>`
    )

    const { width, height } = await getImageSize(svg)
    expect(width).toBe(100)
    expect(height).toBe(200)
  })

  it('rethrows for a buffer that is not a recognizable image', async () => {
    await expect(getImageSize(Buffer.from('not an image'))).rejects.toThrow()
  })
})
