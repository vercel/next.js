import { isNextStart, nextTestSetup } from 'e2e-utils'

describe('external-wasm-tracing', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      '@takumi-rs/image-response': '1.0.9',
    },
  })

  it('traces and serves an external package that uses WASM', async () => {
    const response = await next.fetch('/image')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/webp')
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(100)

    if (isNextStart) {
      const trace = JSON.parse(
        await next.readFile('.next/server/app/image/route.js.nft.json')
      )

      expect(
        trace.files.some((file: string) => file.endsWith('takumi_wasm_bg.wasm'))
      ).toBe(true)
      expect(
        trace.files.some((file: string) => file.includes('[turbopack-wasm]'))
      ).toBe(false)
    }
  })
})
