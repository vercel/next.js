import { nextTestSetup } from 'e2e-utils'
import { readdir, readFile } from 'fs/promises'
import path from 'path'

describe('browser React timings disabled and production bundles', () => {
  const { next, isNextDeploy } = nextTestSetup({ files: __dirname })

  it('renders without including the decoder host in browser chunks', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('p').text()).toBe('hello world')
    if (isNextDeploy) return

    const chunks = path.join(next.testDir, next.distDir, 'static')
    const files = await readdir(chunks, { recursive: true })
    const javascript = files.filter((file) => file.endsWith('.js'))
    expect(javascript.length).toBeGreaterThan(0)
    for (const file of javascript) {
      const code = await readFile(path.join(chunks, file), 'utf8')
      expect(code).not.toMatch(
        /react-decoder-host|bindReactDecoderStream|runWithReactDecoderScope|Some React timings were dropped/
      )
    }
  })
})
