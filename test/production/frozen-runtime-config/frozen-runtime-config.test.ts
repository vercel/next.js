import { nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'

describe('frozen-runtime-config', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    startCommand: 'node server.js',
    serverReadyPattern: /- Local:/,
    // This test controls the launcher to force manifest fallback without a
    // router-server config override; the deployed launcher is platform-owned.
    skipDeployment: true,
  })
  if (skipped) return

  it('preserves image option order in the manifest', async () => {
    const manifest = JSON.parse(
      await next.readFile('.next/required-server-files.json')
    )
    expect(manifest.config.images.deviceSizes).toEqual([1080, 640])
    expect(manifest.config.images.imageSizes).toEqual([256, 128])
    expect(manifest.config.images.qualities).toEqual([90, 60])
    expect(manifest.config.images.path).toBe('/custom-image')
  })

  it('renders external image components repeatedly with the frozen manifest', async () => {
    for (let i = 0; i < 2; i++) {
      const response = await next.fetch('/')
      expect(response.status).toBe(200)
      const $ = cheerio.load(await response.text())
      for (const id of ['modern', 'legacy']) {
        const img = $(`#${id}`)
        const candidates = img
          .attr('srcset')
          .split(', ')
          .map((candidate) => {
            const [src, density] = candidate.split(' ')
            const url = new URL(src, next.url)
            return [
              url.searchParams.get('w'),
              url.searchParams.get('q'),
              density,
            ]
          })
        expect(candidates).toEqual([
          ['128', '60', '1x'],
          ['256', '60', '2x'],
        ])
        expect(img.attr('srcset')).toContain('/custom-image?')
      }
      const state = await (await next.fetch('/manifest-state')).json()
      expect(state).toEqual({
        frozen: true,
        unchanged: true,
        deviceSizes: [1080, 640],
        imageSizes: [256, 128],
        qualities: [90, 60],
      })
    }
  })
})
