import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import fs from 'fs'
import path from 'path'

describe('swc-auto-polyfill', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('should render the page correctly', async () => {
    const browser = await next.browser('/')
    await retry(async () => {
      const text = await browser.elementByCss('#result').text()
      expect(text).toBe('last: 3')
    })
  })

  if (!isNextDev) {
    it('should include core-js polyfill imports in the build output', async () => {
      const staticDir = path.join(next.testDir, '.next', 'static')
      const chunksDir = path.join(staticDir, 'chunks')

      // Read all JS files in the chunks directory to look for core-js references
      const files = fs.readdirSync(chunksDir, { recursive: true }) as string[]
      const jsFiles = files.filter((f) => f.endsWith('.js'))

      let foundCoreJs = false
      for (const file of jsFiles) {
        const content = fs.readFileSync(path.join(chunksDir, file), 'utf-8')
        if (content.includes('core-js')) {
          foundCoreJs = true
          break
        }
      }

      expect(foundCoreJs).toBe(true)
    })
  }
})
