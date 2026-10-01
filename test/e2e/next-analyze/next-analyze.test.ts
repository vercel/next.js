import { nextTestSetup } from 'e2e-utils'
import { retry, shouldUseTurbopack } from 'next-test-utils'
import { createServer } from 'node:http'
import path from 'node:path'
import type { ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import type { Page } from 'playwright'
import serveHandler from 'next/dist/compiled/serve-handler'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely inspects local build artifacts that deploy tests do not expose.
// @force-gate !deploy
describe('next analyze', () => {
  if (!shouldUseTurbopack()) {
    // Test suites require at least one test
    it('skips in non-Turbopack tests', () => {})
    return
  }

  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('runs successfully without errors', async () => {
    let serveProcess: ChildProcess | undefined
    let stdoutBuffer = ''
    let resolveUrl!: (url: string) => void
    let rejectUrl!: (err: Error) => void
    const urlPromise = new Promise<string>((resolve, reject) => {
      resolveUrl = resolve
      rejectUrl = reject
    })

    const timeout = setTimeout(() => {
      rejectUrl(new Error('Server did not start within timeout'))
    }, 30000)

    const exit = next
      .runCommand(['analyze', '--port', '0'], {
        onStdout(msg) {
          stdoutBuffer += msg
          const urlMatch = stdoutBuffer.match(/http:\/\/[^\s]+/)
          if (urlMatch) {
            resolveUrl(urlMatch[0])
          }
        },
        instance(p) {
          serveProcess = p
        },
      })
      .finally(() => {
        clearTimeout(timeout)
      })

    try {
      const url = await urlPromise
      const response = await fetch(url)
      expect(response.status).toBe(200)
      expect(await response.text()).toContain(
        '<title>Next.js Bundle Analyzer</title>'
      )
    } finally {
      serveProcess?.kill()
      await exit.catch(() => {})
    }
  })

  it('compares the newest snapshot after the history index revalidates', async () => {
    const analyzeDir = path.join(next.testDir, '.next/diagnostics/analyze')
    const indexPath = path.join(analyzeDir, 'history/history.json')
    const firstBuild = await next.runCommand(['analyze', '--output'])
    expect(firstBuild.exitCode).toBe(0)
    const first = JSON.parse(readFileSync(indexPath, 'utf8')).snapshots[0]

    await next.patchFile(
      'app/page.tsx',
      (content) =>
        `import AddedClient from '../components/added-client'\n${content?.replace('<div>Hello World</div>', '<div>Hello World<AddedClient /></div>')}`,
      async () => {
        const secondBuild = await next.runCommand(['analyze', '--output'])
        expect(secondBuild.exitCode).toBe(0)
        const completeIndex = readFileSync(indexPath, 'utf8')
        const second = JSON.parse(completeIndex).snapshots[0]
        expect(second.id).not.toBe(first.id)
        const oldSummary = JSON.parse(
          readFileSync(
            path.join(analyzeDir, 'history', first.id, 'route-summaries.json'),
            'utf8'
          )
        ).find((route: { route: string }) => route.route === '/')
        const newSummary = JSON.parse(
          readFileSync(
            path.join(analyzeDir, 'history', second.id, 'route-summaries.json'),
            'utf8'
          )
        ).find((route: { route: string }) => route.route === '/')
        expect(newSummary.compressed_size).not.toBe(oldSummary.compressed_size)

        // Make a previously fetched index heuristically cacheable, then publish
        // the new index while the same browser tab remains open.
        writeFileSync(indexPath, JSON.stringify({ snapshots: [first] }))
        const earlier = new Date(Date.now() - 60 * 60 * 1000)
        utimesSync(indexPath, earlier, earlier)
        let missingIndex = false
        const requests: Array<{
          url: string
          cacheControl: string | undefined
        }> = []
        const server = createServer((req, res) => {
          requests.push({
            url: req.url ?? '',
            cacheControl: req.headers['cache-control'],
          })
          if (missingIndex && req.url === '/history/history.json') {
            res.writeHead(404)
            res.end()
            return
          }
          return serveHandler(req, res, { public: analyzeDir })
        })
        let browser: Awaited<ReturnType<typeof next.browser>> | undefined
        try {
          await new Promise<void>((resolve) => server.listen(0, resolve))
          const address = server.address()
          if (!address || typeof address === 'string') {
            throw new Error('Expected a TCP port for the analyzer server')
          }
          const baseUrl = `http://localhost:${address.port}`
          let page!: Page
          browser = await next.browser(`/compare?from=${first.id}&route=%2F`, {
            baseUrl,
            beforePageLoad: (loadedPage) => {
              page = loadedPage
            },
          })
          await retry(async () => {
            expect(
              await page
                .getByText('Routes changed', { exact: true })
                .locator('..')
                .innerText()
            ).toBe('ROUTES CHANGED\n0')
          })
          writeFileSync(indexPath, completeIndex)
          await retry(async () => {
            // SWR throttles focus events; retry until it accepts the new one.
            await page.evaluate(() => window.dispatchEvent(new Event('focus')))
            expect(
              await page
                .getByText('Routes changed', { exact: true })
                .locator('..')
                .innerText()
            ).toBe('ROUTES CHANGED\n1')
          })
          const latestSize = await page
            .getByText('Total size', { exact: true })
            .first()
            .locator('..')
            .innerText()
          expect(latestSize).not.toContain('±0')
          await page.goto(
            `${baseUrl}/compare?from=${first.id}&to=${second.id}&route=%2F`
          )
          await retry(async () => {
            expect(
              await page
                .getByText('Total size', { exact: true })
                .first()
                .locator('..')
                .innerText()
            ).toBe(latestSize)
          })
          await page.goto(`${baseUrl}/compare?from=${first.id}&route=%2F`)
          await retry(async () => {
            expect(
              await page
                .getByText('Total size', { exact: true })
                .first()
                .locator('..')
                .innerText()
            ).toBe(latestSize)
          })
          await page.goto(
            `${baseUrl}/compare?from=${second.id}&to=${first.id}&route=%2F`
          )
          await page
            .getByRole('button', { name: 'Compare with latest' })
            .waitFor()
          const indexRequestCount = requests.filter(
            ({ url }) => url === '/history/history.json'
          ).length
          await page
            .getByRole('button', { name: 'Compare with latest' })
            .click()
          await retry(async () => {
            expect(new URL(page.url()).searchParams.has('to')).toBe(false)
            expect(
              await page
                .getByText('Total size', { exact: true })
                .first()
                .locator('..')
                .innerText()
            ).toContain('±0')
          })
          expect(
            requests.filter(({ url }) => url === '/history/history.json').length
          ).toBe(indexRequestCount)
          const indexRequests = requests.filter(
            ({ url }) => url === '/history/history.json'
          )
          expect(indexRequests.length).toBeGreaterThan(1)
          expect(
            indexRequests.every(
              ({ cacheControl }) => cacheControl === 'max-age=0'
            )
          ).toBe(true)
          expect(
            requests
              .filter(({ url }) => url.startsWith(`/history/${second.id}/`))
              .every(({ cacheControl }) => cacheControl === undefined)
          ).toBe(true)
          expect(
            requests.some(({ url }) =>
              url.startsWith(`/history/${second.id}/analyze.data`)
            )
          ).toBe(true)
          expect(requests.some(({ url }) => url.startsWith('/data/'))).toBe(
            false
          )

          missingIndex = true
          await page.goto(`${baseUrl}/`)
          await retry(async () => {
            expect(await page.locator('body').innerText()).toContain(
              'Failed to fetch /history/history.json: 404'
            )
          })
          expect(requests.some(({ url }) => url.startsWith('/data/'))).toBe(
            false
          )
        } finally {
          if (browser) await browser.close()
          await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve()))
          )
          writeFileSync(indexPath, completeIndex)
        }
      }
    )
  })

  it('stores the snapshot name in live and historical metadata', async () => {
    const name = 'My snapshot'
    const { exitCode, stderr } = await next.runCommand([
      'analyze',
      '--output',
      '--snapshot-name',
      name,
    ])

    expect(exitCode).toBe(0)
    expect(stderr).not.toContain('Error')

    const analyzeDir = path.join(next.testDir, '.next/diagnostics/analyze')
    const metadata = JSON.parse(
      readFileSync(path.join(analyzeDir, 'data/metadata.json'), 'utf-8')
    )
    expect(metadata.snapshotName).toBe(name)
    expect(metadata).not.toHaveProperty('baselineName')

    const history = JSON.parse(
      readFileSync(path.join(analyzeDir, 'history/history.json'), 'utf-8')
    )
    expect(history.snapshots[0].snapshotName).toBe(name)
    expect(history.snapshots[0]).not.toHaveProperty('baselineName')
  })
  ;['-o', '--output'].forEach((flag) => {
    describe(`with ${flag} flag`, () => {
      it('writes output to .next/diagnostics/analyze path', async () => {
        const defaultOutputPath = path.join(
          next.testDir,
          '.next/diagnostics/analyze'
        )

        const { exitCode, stderr, stdout } = await next.runCommand([
          'analyze',
          flag,
        ])

        expect(exitCode).toBe(0)
        expect(stderr).not.toContain('Error')
        expect(stdout).toContain('.next/diagnostics/analyze')

        expect(existsSync(defaultOutputPath)).toBe(true)
        for (const file of [
          'index.html',
          'data/routes.json',
          'data/route-summaries.json',
          'data/modules.data',
          'data/analyze.data',
        ]) {
          expect(existsSync(path.join(defaultOutputPath, file))).toBe(true)
        }

        const routesJson = readFileSync(
          path.join(defaultOutputPath, 'data', 'routes.json'),
          'utf-8'
        )
        const routes = JSON.parse(routesJson)
        expect(routes).toEqual(['/', '/_not-found'])

        const routeSummaries = JSON.parse(
          readFileSync(
            path.join(defaultOutputPath, 'data', 'route-summaries.json'),
            'utf-8'
          )
        )
        expect(
          routeSummaries.map((summary: { route: string }) => summary.route)
        ).toEqual(expect.arrayContaining(routes))
        for (const summary of routeSummaries) {
          expect(Number.isFinite(summary.size)).toBe(true)
          expect(summary.size).toBeGreaterThanOrEqual(0)
          expect(Number.isFinite(summary.compressed_size)).toBe(true)
          expect(summary.compressed_size).toBeGreaterThanOrEqual(0)

          // The summary and analyze.data must account for exactly the same
          // chunk parts, including shared assets and traced files.
          const routeDir = summary.route.replace(/^\//, '')
          const analyzeBuffer = readFileSync(
            path.join(defaultOutputPath, 'data', routeDir, 'analyze.data')
          )
          const header = JSON.parse(
            analyzeBuffer
              .subarray(4, 4 + analyzeBuffer.readUInt32BE(0))
              .toString('utf-8')
          ) as {
            output_files: { filename: string }[]
            chunk_parts: {
              output_file_index: number
              size: number
              compressed_size: number
            }[]
          }
          const totals = {
            size: 0,
            compressed_size: 0,
            client: { size: 0, compressed_size: 0 },
          }
          for (const part of header.chunk_parts) {
            totals.size += part.size
            totals.compressed_size += part.compressed_size
            if (
              header.output_files[part.output_file_index].filename.startsWith(
                '[client-fs]/'
              )
            ) {
              totals.client.size += part.size
              totals.client.compressed_size += part.compressed_size
            }
          }
          expect(summary).toMatchObject(totals)
          expect(
            header.output_files.some(({ filename }) =>
              /\.(?:map|nft\.json)$/.test(filename)
            )
          ).toBe(false)
        }

        const history = JSON.parse(
          readFileSync(
            path.join(defaultOutputPath, 'history', 'history.json'),
            'utf-8'
          )
        )
        const snapshotRouteSummaries = readFileSync(
          path.join(
            defaultOutputPath,
            'history',
            history.snapshots[0].id,
            'route-summaries.json'
          ),
          'utf-8'
        )
        expect(JSON.parse(snapshotRouteSummaries)).toEqual(routeSummaries)
      })
    })
  })
})
