import { FileRef, isNextStart, nextTestSetup } from 'e2e-utils'
import { retry, shouldUseTurbopack } from 'next-test-utils'
import fs from 'fs/promises'
import path from 'path'
import { promisify } from 'util'
import globOrig from 'glob'

const glob = promisify(globOrig)

/**
 * Builds one of the two modules that the worker shares with the pages. Each of them
 * has to be big enough to become a component chunk on its own
 * (`minComponentChunkSize`) but small enough to be merged with the other one
 * (`minChunkSize`), and together they have to exceed `minChunkSize` — see
 * next.config.js for those thresholds. Only the size of the filler matters, so it is
 * generated here instead of being checked in.
 */
function sharedModule(marker: string): string {
  const filler: string[] = []

  for (let bytes = 0, i = 0; bytes < 5600; i++) {
    const entry = `${marker}-filler-${i}-${'0123456789abcdefghijklmnopqrstuvwxyz'.repeat(2)}`
    filler.push(entry)
    bytes += entry.length
  }

  return `export const marker = ${JSON.stringify(marker)}
export const payload = ${JSON.stringify(filler)}.join('|')
`
}

// Component chunks are only emitted by Turbopack's production chunking, so there is
// nothing to cover in development or with webpack.
;(shouldUseTurbopack() && isNextStart ? describe : describe.skip)(
  'app dir - worker with component chunks',
  () => {
    const { next } = nextTestSetup({
      files: {
        app: new FileRef(path.join(__dirname, 'app')),
        'next.config.js': new FileRef(path.join(__dirname, 'next.config.js')),
        'lib/shared-with-both-pages.js': sharedModule('both-pages'),
        'lib/shared-with-one-page.js': sharedModule('one-page'),
      },
    })

    it('should pass a merged chunk to the worker', async () => {
      const staticDir = path.join(next.testDir, '.next/static')
      const chunkPaths = await glob('**/chunks/**/*.js', {
        cwd: staticDir,
        nodir: true,
      })
      const chunks = await Promise.all(
        chunkPaths.map((chunkPath) =>
          fs.readFile(path.join(staticDir, chunkPath), 'utf8')
        )
      )

      // The generated worker loader calls `createWorker` with the worker entrypoint
      // followed by the worker's chunk list. A merged chunk is passed as an object
      // (`{ path, moduleChunks }`) rather than a plain path string, which is the case
      // this fixture exists to cover: `lib/shared-with-both-pages.js` and
      // `lib/shared-with-one-page.js` are reachable from different sets of pages, so
      // they get merged into one chunk that is then split into two component chunks.
      const chunkLists = chunks.flatMap((content) => {
        const matches = content.matchAll(/turbopack-worker-[^"]+\.js",/g)
        // The chunk list follows the entrypoint, well within the next 500 characters.
        return Array.from(matches, (match) =>
          content.slice(match.index, match.index + 500)
        )
      })

      expect(chunkLists).not.toHaveLength(0)
      expect(
        chunkLists.some((chunkList) => chunkList.includes('moduleChunks'))
      ).toBe(true)
    })

    it('should support a web worker whose chunks include a merged chunk', async () => {
      const browser = await next.browser('/')
      expect(await browser.elementByCss('#worker-state').text()).toBe('default')

      await browser.elementByCss('button').click()

      await retry(async () =>
        expect(await browser.elementByCss('#worker-state').text()).toMatch(
          /^both-pages:\d+\|one-page:\d+$/
        )
      )
    })

    it('should render the pages that share modules with the worker', async () => {
      const pageA = await next.browser('/page-a')
      expect(await pageA.elementByCss('#both-pages').text()).toMatch(/^\d+$/)
      expect(await pageA.elementByCss('#one-page').text()).toMatch(/^\d+$/)

      const pageB = await next.browser('/page-b')
      expect(await pageB.elementByCss('#both-pages').text()).toMatch(/^\d+$/)
    })
  }
)
