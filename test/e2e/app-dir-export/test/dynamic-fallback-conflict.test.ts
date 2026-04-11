import { join } from 'path'
import fs from 'fs-extra'
import { nextTestSetup } from 'e2e-utils'
import webdriver from 'next-webdriver'
import { retry } from 'next-test-utils'
import { buildAndStartOutputExportServer } from './utils'

describe('app dir - output export fallback conflicts', () => {
  const { next, skipped } = nextTestSetup({
    files: join(__dirname, '..', 'fixtures', 'dynamic-fallback-conflict'),
    skipStart: true,
    skipDeployment: true,
    disableAutoSkewProtection: true,
  })

  if (skipped) {
    return
  }

  let port: number
  let stopOrKill: (() => Promise<void>) | undefined

  beforeAll(async () => {
    ;({ port, stopOrKill } = await buildAndStartOutputExportServer(next, {
      trailingSlash: true,
      useFallbackDocument: true,
    }))
  })

  afterAll(async () => {
    await stopOrKill?.()
  })

  it('emits fallback metadata and branch-specific fallback artifacts', async () => {
    const outDir = join(next.testDir, 'out')
    const manifestPath = join(outDir, 'docs', '__fallback.meta.json')
    const knownSpecificParamExists =
      (await fs.pathExists(
        join(outDir, 'docs', 'api', 'reference', 'index.html')
      )) || (await fs.pathExists(join(outDir, 'docs', 'api', 'reference.html')))
    const unknownSpecificParamExists =
      (await fs.pathExists(
        join(outDir, 'docs', 'api', 'guide', 'index.html')
      )) || (await fs.pathExists(join(outDir, 'docs', 'api', 'guide.html')))

    expect(await fs.pathExists(join(outDir, '_fallback.html'))).toBe(true)
    expect(await fs.pathExists(manifestPath)).toBe(true)
    expect(knownSpecificParamExists).toBe(true)
    expect(unknownSpecificParamExists).toBe(false)

    const manifest = await fs.readJson(manifestPath)
    expect(manifest).toEqual({
      version: 1,
      routes: [
        {
          route: '/docs/[section]/[page]',
          fallbackPath: '/docs/__fallback/__route_0',
        },
        {
          route: '/docs/[...slug]',
          fallbackPath: '/docs/__fallback/__route_1',
        },
      ],
    })

    for (const entry of manifest.routes) {
      const relativeFallbackPath = entry.fallbackPath.slice(1)
      const hasBranchPayload =
        (await fs.pathExists(join(outDir, `${relativeFallbackPath}.txt`))) ||
        (await fs.pathExists(join(outDir, relativeFallbackPath, 'index.txt')))

      expect(hasBranchPayload).toBe(true)
    }
  })

  it('keeps known params prerendered while unknown params on the same branch fall back', async () => {
    const browser = await webdriver(port, '/docs/api/reference/')

    try {
      await retry(async () => {
        expect(await browser.elementByCss('h1').text()).toBe('api:reference')
      })

      await browser.get(`http://localhost:${port}/docs/api/guide/`)
      await retry(async () => {
        expect(await browser.elementByCss('h1').text()).toBe('api:guide')
      })
    } finally {
      await browser.close()
    }
  })

  it('prefers the more specific route when multiple fallback branches match', async () => {
    const browser = await webdriver(port, '/docs/api/reference/')

    try {
      await retry(async () => {
        expect(await browser.elementByCss('h1').text()).toBe('api:reference')
      })
    } finally {
      await browser.close()
    }
  })

  it('falls through to the catch-all branch when the specific route does not match', async () => {
    const browser = await webdriver(port, '/docs/guides/export/fallback/')

    try {
      await retry(async () => {
        expect(await browser.elementByCss('h1').text()).toBe(
          'catchall:guides/export/fallback'
        )
      })
    } finally {
      await browser.close()
    }
  })
})
