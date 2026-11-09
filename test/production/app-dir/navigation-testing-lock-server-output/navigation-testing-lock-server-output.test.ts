import { nextTestSetup } from 'e2e-utils'
import { promises as fs } from 'fs'
import path from 'path'

// The navigation lock of the Instant Navigation Testing API listens for its
// cookie with the CookieStore API. No other module of the client router uses
// that API, so its name marks the lock in minified output.
const LOCK_MARKER = 'cookieStore'

async function findServerFilesWithLock(distDir: string): Promise<string[]> {
  const serverDir = path.join(distDir, 'server')
  const files = await fs.readdir(serverDir, { recursive: true })
  const matches: string[] = []
  for (const file of files) {
    if (!file.endsWith('.js')) continue
    const content = await fs.readFile(path.join(serverDir, file), 'utf8')
    if (content.includes(LOCK_MARKER)) matches.push(file)
  }
  return matches
}

// This test accesses the filesystem, which is not available in deploy mode
// @force-gate !deploy
describe('navigation-testing-lock-server-output', () => {
  describe('without the testing API', () => {
    const { next, isTurbopack } = nextTestSetup({
      files: __dirname,
    })

    it('should render the page', async () => {
      const $ = await next.render$('/')
      expect($('p').text()).toBe('hello world')
    })

    it('should not include the navigation testing lock in the server output', async () => {
      const filesWithLock = await findServerFilesWithLock(
        path.join(next.testDir, next.distDir)
      )
      if (isTurbopack) {
        expect(filesWithLock).toEqual([])
      } else {
        // webpack and Rspack keep the lock in the server output:
        // `segment-cache/fetch` imports it statically, and only the browser
        // build has an alias that replaces it.
        expect(filesWithLock).not.toEqual([])
      }
    })
  })

  describe('with the testing API', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      nextConfig: {
        cacheComponents: true,
        experimental: {
          exposeTestingApiInProductionBuild: true,
        },
      },
    })

    // If the marker stops matching the lock, this fails instead of the check
    // above passing.
    it('should include the navigation testing lock in the server output', async () => {
      expect(
        await findServerFilesWithLock(path.join(next.testDir, next.distDir))
      ).not.toEqual([])
    })
  })
})
