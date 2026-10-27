import { FileRef, nextTestSetup } from 'e2e-utils'
import { createHash } from 'crypto'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'

describe.each(['false', 'true', 'none', 'client', 'server', 'both'])(
  'turbopack-fragments-targets: %s',
  (target) => {
    const { next } = nextTestSetup({
      files: {
        app: new FileRef(join(__dirname, 'app')),
        lib: new FileRef(join(__dirname, 'lib')),
        'next.config.ts': new FileRef(join(__dirname, 'next.config.ts')),
        ...Object.fromEntries(
          Array.from({ length: 16 }, (_, feature) => {
            const data = Array.from({ length: 256 }, (_, index) =>
              createHash('sha256').update(`${feature}:${index}`).digest('hex')
            )
            return [
              `lib/data-${feature}.ts`,
              `export const data = ${JSON.stringify(data)}\n`,
            ]
          })
        ),
      },
      env: { FRAGMENT_TARGET: target },
    })

    it('renders server and client consumers', async () => {
      const $ = await next.render$('/')
      expect($('p')).toHaveLength(2)
      expect($('p').first().text()).toMatch(/^feature-0:/)
      expect($('p').last().text()).toBe($('p').first().text())
      const browser = await next.browser('/')
      expect(await browser.elementByCss('p').text()).toMatch(/^feature-0:/)
    })

    it('retains all exports for namespace consumers', async () => {
      const $ = await next.render$('/all')
      expect($('p').first().text().split('|')).toHaveLength(16)
    })

    // Deployment has no local output; rendering and hydration are covered above.
    // @force-gate start && turbopack
    it('applies fragments independently to browser and server chunks', async () => {
      const $ = await next.render$('/')
      const scripts = $('script[src]')
        .map((_, script) => $(script).attr('src'))
        .get()
      const browserCode = await Promise.all(
        scripts.map(async (src) => (await next.fetch(src)).text())
      )
      const path = join(next.testDir, next.distDir, 'server/chunks/ssr')
      const files = (await readdir(path)).filter((file) => file.endsWith('.js'))
      const serverCode = await Promise.all(
        files.map((file) => readFile(join(path, file), 'utf8'))
      )
      for (const [codes, enabled] of [
        [browserCode, ['true', 'client', 'both'].includes(target)],
        [serverCode, ['true', 'server', 'both'].includes(target)],
      ] as const) {
        let featureChunks = 0
        for (const code of codes) {
          if (code.includes('feature-0:')) {
            featureChunks++
            const features = new Set(code.match(/feature-\d+:/g))
            expect(features.size).toBe(enabled ? 1 : 16)
          }
        }
        expect(featureChunks).toBeGreaterThan(0)
      }
    })
  }
)
