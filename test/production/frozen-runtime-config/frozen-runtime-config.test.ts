import { nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'
import execa from 'execa'

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

  it('registers inlined options before a cold route import without a worker env', async () => {
    async function run(mode: string) {
      const result = await execa('node', ['cold-import-driver.js', mode], {
        cwd: next.testDir,
      })
      const line = result.stdout
        .split('\n')
        .find((entry) => entry.startsWith('COLD_IMPORT_RESULT='))
      expect(line).toBeDefined()
      return JSON.parse(line!.slice('COLD_IMPORT_RESULT='.length))
    }

    const withRegistration = await run('with-registration')
    const withoutRegistration = await run('without-registration')
    expect(withRegistration.environmentUndefined).toBe(true)
    expect(withRegistration.environmentUndefinedBefore).toBe(true)
    expect(withoutRegistration.environmentUndefined).toBe(true)
    expect(withoutRegistration.environmentUndefinedBefore).toBe(true)
    expect(withRegistration.externalFilename.replace(/\\/g, '/')).toContain(
      'node_modules/test-external-image/index.js'
    )
    expect(withRegistration.registrations).toContainEqual({
      path: '/custom-image',
      deviceSizes: [1080, 640],
      qualities: [90, 60],
      environmentUndefined: true,
    })
    expect(withoutRegistration.registrations).toContainEqual({
      path: '/custom-image',
      deviceSizes: [1080, 640],
      qualities: [90, 60],
      environmentUndefined: true,
    })
    expect(withRegistration.path).toBe('/custom-image')
    expect(withRegistration.srcSet).toContain('/custom-image?')
    expect(withRegistration.srcSet).toContain('w=640&q=60 640w')
    expect(withRegistration.srcSet).toContain('w=1080&q=60 1080w')
    expect(withoutRegistration.path).toBe('/_next/image')
    expect(withoutRegistration.srcSet).toContain('/_next/image?')
    expect(withoutRegistration.srcSet).toContain('q=75')
  })

  it('renders external image components repeatedly with the frozen manifest', async () => {
    for (let i = 0; i < 2; i++) {
      const response = await next.fetch('/')
      expect(response.status).toBe(200)
      const $ = cheerio.load(await response.text())
      expect($('#module-scope-props').attr('data-srcset')).toContain(
        '/custom-image?'
      )
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
