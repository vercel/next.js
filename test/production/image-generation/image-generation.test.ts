import { nextTestSetup } from 'e2e-utils'

describe('image-generation', () => {
  describe('production mode', () => {
    const { next, isNextStart } = nextTestSetup({
      files: __dirname,
      dependencies: {
        '@vercel/og': 'latest',
      },
    })

    if (!isNextStart) {
      it('skipped for non-start mode', () => {})
      return
    }

    it('should generate the image without errors', async () => {
      const res = await next.fetch('/api/image')
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('image/png')

      const buffer = Buffer.from(await res.arrayBuffer())

      // It should be a PNG
      expect(
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
          (b, i) => buffer[i] === b
        )
      ).toBeTrue()
    })
  })
})
