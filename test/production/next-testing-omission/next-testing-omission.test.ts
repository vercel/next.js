import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { readdir, readFile } from 'fs/promises'
import { join, resolve, sep } from 'path'
import type { Page } from 'playwright'

const testCookie = 'next-instant-navigation-testing'
const forbiddenDependency =
  /(?:experimental\/testing\/|compiled\/next-test-primitives\/|node_modules\/(?:@vitest\/|vitest\/))/
const runtimeMarkers = [
  'Test worker requires IPC',
  'Browser execution requires emitted browser bindings and parent leases',
  'Browser fixtures require an active Next test attempt',
  'expect() requires an active Next test attempt or suite hook',
]

async function javascriptFiles(directory: string): Promise<string[]> {
  const files = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    files.map(async (file) => {
      const path = join(directory, file.name)
      if (file.isDirectory()) return javascriptFiles(path)
      return file.name.endsWith('.js') ? [path] : []
    })
  )
  return nested.flat()
}

// Requires a local production build: patches its config and reads route traces.
// @force-gate start
describe('ordinary production omits Next testing transport', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, '../../e2e/app-dir/next-testing-reference'),
    skipStart: true,
  })

  beforeAll(async () => {
    // Change only the explicit testing opt-in in the isolated installation.
    await next.patchFile('next.config.js', (source) => {
      if (!source.includes('exposeTestingApiInProductionBuild: true')) {
        throw new Error('Canonical fixture testing opt-in was not found')
      }
      return source.replace('exposeTestingApiInProductionBuild: true', '')
    })
    await next.start()
  })

  it('renders normal dynamic content and ignores the instant-testing cookie', async () => {
    const home = await next.render$('/')
    expect(home('#unit-result').text()).toBe('10')
    const pages = await Promise.all(
      ['alice', 'bob', undefined].map((visitor) =>
        next.render$(
          '/reference',
          {},
          {
            headers: {
              cookie: `${testCookie}=pending${visitor ? `; reference-visitor=${visitor}` : ''}`,
            },
          }
        )
      )
    )
    pages.forEach(($, index) => {
      expect($('#visitor').text()).toBe(['alice', 'bob', 'anonymous'][index])
      expect($('#nested-message').text()).toBe('server sum: 10')
      expect($('#counter').text()).toBe('Count: 10')
    })
  })

  it('navigates and hydrates while a testing cookie remains pending', async () => {
    let page: Page
    const browser = await next.browser('/', {
      async beforePageLoad(p) {
        page = p
        await p
          .context()
          .addCookies([{ name: testCookie, value: 'pending', url: next.url }])
      },
    })
    try {
      await page!.click('#reference-link')
      await page!.locator('#completed').waitFor({ state: 'visible' })
      expect(await page!.locator('#nested-message').textContent()).toBe(
        'server sum: 10'
      )
      await page!.click('#counter')
      await retry(async () => {
        expect(await page!.locator('#counter').textContent()).toBe('Count: 11')
      })
      expect(
        (await page!.context().cookies()).find(
          (cookie) => cookie.name === testCookie
        )?.value
      ).toBe('pending')
    } finally {
      await browser.close()
    }
  })

  it('finds no testing dependencies or implementation markers in inspected output', async () => {
    const required = await next.readJSON('.next/required-server-files.json')
    expect(
      required.config.experimental.exposeTestingApiInProductionBuild
    ).not.toBe(true)
    const clientFiles = await javascriptFiles(
      join(next.testDir, '.next/static')
    )
    expect(clientFiles.length).toBeGreaterThan(0)
    const serverFiles = new Set<string>()
    const serverRoot = join(next.testDir, '.next/server') + sep
    for (const route of ['page', 'reference/page']) {
      const entry = join(next.testDir, '.next/server/app', `${route}.js`)
      const trace = JSON.parse(await readFile(`${entry}.nft.json`, 'utf8'))
      expect(trace.files.length).toBeGreaterThan(0)
      serverFiles.add(entry)
      for (const relativePath of trace.files as string[]) {
        const dependency = resolve(entry, '..', relativePath)
        expect(dependency.replaceAll('\\', '/')).not.toMatch(
          forbiddenDependency
        )
        if (dependency.startsWith(serverRoot) && dependency.endsWith('.js')) {
          serverFiles.add(dependency)
        }
      }
    }
    // Client files are a conservative superset of reachable client chunks.
    // Server files are the two routes' traced emitted JavaScript dependencies.
    // NFT records file dependencies, not every inlined module. Marker checks
    // supplement those traces; they do not prove arbitrary code is absent.
    // Installed framework files and source maps are not application code here.
    for (const file of [...clientFiles, ...serverFiles]) {
      const source = await readFile(file, 'utf8')
      expect(source).not.toMatch(forbiddenDependency)
      for (const marker of runtimeMarkers) expect(source).not.toContain(marker)
      if (clientFiles.includes(file)) {
        // Shared headers retain the cookie name, and the inert shim retains
        // API exports. The active lock's Cookie Store implementation must not
        // ship in this fixture, which does not itself use the Cookie Store API.
        expect(source).not.toMatch(/\bcookieStore\b/)
      }
    }
    expect(next.cliOutput).not.toMatch(
      /panicked at|Failed to restore data|Unable to open static sorted file/
    )
  })
})
