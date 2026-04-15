import { nextTestSetup } from 'e2e-utils'

describe('image-generation', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      const { next } = nextTestSetup({
        files: __dirname,
        dependencies: {
          '@vercel/og': '0.11.1',
        },
      })

      it('should generate the image without errors', async () => {
        const res = await next.fetch('/api/image')
        expect(res.status).toBe(200)
        expect(res.headers.get('Content-Type')).toBe('image/png')

        const buffer = await res.buffer()

        // It should be a PNG
        expect(
          [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
            (b, i) => buffer[i] === b
          )
        ).toBeTrue()
      })
    }
  )
})
