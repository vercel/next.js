import { nextTestSetup } from 'e2e-utils'

describe('sharp api', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      sharp: '^0.34.5',
    },
  })

  it('should handle custom sharp usage', async () => {
    const res = await next.fetch('/api/custom-sharp')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0)
    const traceFile = await next.readJSON(
      '.next/server/pages/api/custom-sharp.js.nft.json'
    )
    expect(
      traceFile.files.some((file: string) => file.includes('sharp/'))
    ).toBe(true)
  })
})
