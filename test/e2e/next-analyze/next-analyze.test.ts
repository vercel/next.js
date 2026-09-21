import { nextTestSetup } from 'e2e-utils'
import { retry, shouldUseTurbopack } from 'next-test-utils'
import webdriver from 'next-webdriver'
import path from 'node:path'
import type { ChildProcess } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

describe('next experimental-analyze', () => {
  if (!shouldUseTurbopack()) {
    // Test suites require at least one test
    it('skips in non-Turbopack tests', () => {})
    return
  }

  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    // Test suites require at least one test
    it('is skipped', () => {})
    return
  }

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
      .runCommand(['experimental-analyze', '--port', '0'], {
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

  it('names snapshots for either side of a comparison', async () => {
    const metadataPath = path.join(
      next.testDir,
      '.next/diagnostics/analyze/data/metadata.json'
    )

    for (const snapshotName of ['before-refactor', 'after-refactor']) {
      const { exitCode } = await next.runCommand([
        'experimental-analyze',
        '--output',
        '--snapshot-name',
        snapshotName,
      ])
      expect(exitCode).toBe(0)

      const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'))
      expect(metadata.snapshotName).toBe(snapshotName)
      await retry(() => {
        expect(Math.floor(Date.now() / 1000)).toBeGreaterThan(
          Math.floor(Date.parse(metadata.createdAt) / 1000)
        )
      })
    }

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
      .runCommand(
        ['experimental-analyze', '--port', '0', '--snapshot-name', 'latest'],
        {
          onStdout(msg) {
            stdoutBuffer += msg
            const urlMatch = stdoutBuffer.match(/http:\/\/[^\s]+/)
            if (urlMatch) resolveUrl(urlMatch[0])
          },
          instance(p) {
            serveProcess = p
          },
        }
      )
      .finally(() => clearTimeout(timeout))

    try {
      const url = await urlPromise
      const browser = await webdriver(url, '')

      await selectSnapshot(browser, 'Compare from', 'before-refactor')
      await selectSnapshot(browser, 'to Latest', 'after-refactor')

      await retry(async () => {
        const controls = await browser.elementsByCss('button[role="combobox"]')
        const labels = await Promise.all(
          controls.map((control) => control.innerText())
        )
        expect(labels).toEqual(
          expect.arrayContaining([
            expect.stringMatching(/from\s+before-refactor/),
            expect.stringMatching(/to\s+after-refactor/),
          ])
        )
      })
    } finally {
      serveProcess?.kill()
      await exit.catch(() => {})
    }
  })
  ;['-o', '--output'].forEach((flag) => {
    describe(`with ${flag} flag`, () => {
      it('writes output to .next/diagnostics/analyze path', async () => {
        const defaultOutputPath = path.join(
          next.testDir,
          '.next/diagnostics/analyze'
        )

        const { exitCode, stderr, stdout } = await next.runCommand([
          'experimental-analyze',
          flag,
        ])

        expect(exitCode).toBe(0)
        expect(stderr).not.toContain('Error')
        expect(stdout).toContain('.next/diagnostics/analyze')

        expect(existsSync(defaultOutputPath)).toBe(true)
        for (const file of [
          'index.html',
          'data/routes.json',
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
      })
    })
  })
})

async function selectSnapshot(
  browser: Awaited<ReturnType<typeof webdriver>>,
  pickerLabel: string,
  snapshotName: string
) {
  let pickerIndex = -1
  await retry(async () => {
    const pickers = await browser.elementsByCss('button[role="combobox"]')
    const labels = await Promise.all(
      pickers.map((picker) => picker.innerText())
    )
    pickerIndex = labels.findIndex((label) => label.includes(pickerLabel))
    expect(pickerIndex).not.toBe(-1)
  })

  const pickers = await browser.elementsByCss('button[role="combobox"]')
  await pickers[pickerIndex].click()
  await browser.elementByCss('[cmdk-input]').type(snapshotName)

  const itemSelector = `[cmdk-item][data-value*="${snapshotName}"]`
  expect(await browser.elementByCss(itemSelector).text()).toContain(
    snapshotName
  )
  await browser.eval((selector) => {
    document.querySelector<HTMLElement>(selector)?.click()
  }, itemSelector)
}
