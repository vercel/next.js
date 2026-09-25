import { nextTestSetup } from 'e2e-utils'
import { retry, shouldUseTurbopack } from 'next-test-utils'
import webdriver from 'next-webdriver'
import path from 'node:path'
import type { ChildProcess } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import {
  diffTreeShaking,
  summarizeTreeShaking,
} from '../../../apps/bundle-analyzer/lib/tree-shaking'

type AnalyzeModule = {
  path: string
  used_exports: 'all' | 'evaluation' | string[]
  own_side_effects: 'free' | 'evaluation-free' | 'effectful'
  transitive_side_effects: 'free' | 'effectful'
}

function readAnalyzeModules(file: string): AnalyzeModule[] {
  const data = readFileSync(file)
  const headerLength = data.readUInt32BE(0)
  return JSON.parse(data.subarray(4, 4 + headerLength).toString()).modules
}

describe('next analyze', () => {
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

  it('summarizes module fragments conservatively', () => {
    expect(
      summarizeTreeShaking([
        {
          used_exports: ['used'],
          own_side_effects: 'free',
          transitive_side_effects: 'free',
        },
        {
          used_exports: ['other'],
          own_side_effects: 'evaluation-free',
          transitive_side_effects: 'effectful',
        },
      ])
    ).toEqual({
      usedExports: ['other', 'used'],
      ownSideEffects: 'evaluation-free',
      transitiveSideEffects: 'effectful',
    })

    expect(
      summarizeTreeShaking([
        {
          used_exports: ['used'],
          own_side_effects: 'free',
          transitive_side_effects: 'free',
        },
        {
          used_exports: 'all',
          own_side_effects: 'effectful',
          transitive_side_effects: 'effectful',
        },
      ])
    ).toEqual({
      usedExports: 'all',
      ownSideEffects: 'effectful',
      transitiveSideEffects: 'effectful',
    })

    expect(summarizeTreeShaking([{}])).toBeNull()
  })

  it('diffs used exports and side-effect states', () => {
    expect(
      diffTreeShaking(
        {
          usedExports: ['removed', 'unchanged'],
          ownSideEffects: 'free',
          transitiveSideEffects: 'free',
        },
        {
          usedExports: ['added', 'unchanged'],
          ownSideEffects: 'evaluation-free',
          transitiveSideEffects: 'effectful',
        }
      )
    ).toEqual({
      usedExports: {
        before: ['removed', 'unchanged'],
        after: ['added', 'unchanged'],
        changed: true,
        kind: 'exports',
        added: ['added'],
        removed: ['removed'],
      },
      ownSideEffects: {
        before: 'free',
        after: 'evaluation-free',
        changed: true,
      },
      transitiveSideEffects: {
        before: 'free',
        after: 'effectful',
        changed: true,
      },
    })

    expect(
      diffTreeShaking(
        {
          usedExports: 'all',
          ownSideEffects: 'free',
          transitiveSideEffects: 'free',
        },
        {
          usedExports: ['used'],
          ownSideEffects: 'free',
          transitiveSideEffects: 'free',
        }
      ).usedExports
    ).toMatchObject({ kind: 'transition', changed: true })
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

      const browser = await webdriver(url, '/')
      try {
        await retry(async () => {
          expect(
            await browser.eval(`(() => {
              const trigger = Array.from(document.querySelectorAll('button')).find(
                (element) => element.textContent?.trim() === 'Client'
              )
              if (!trigger) return false
              trigger.click()
              return true
            })()`)
          ).toBe(true)
        })
        await retry(async () => {
          expect(
            await browser.eval(`(() => {
              const option = Array.from(
                document.querySelectorAll('[role="option"]')
              ).find((element) => element.textContent?.trim() === 'Server')
              if (!option) return false
              option.click()
              return true
            })()`)
          ).toBe(true)
        })
        await retry(async () => {
          await browser.elementByCss('button[aria-label="Table view"]').click()
          expect(
            await browser.eval(`(() => {
              const row = Array.from(document.querySelectorAll('tr')).find(
                (element) => element.textContent?.includes('transitive-effect.ts')
              )
              if (!row) return false
              row.click()
              return true
            })()`)
          ).toBe(true)
        })
        await retry(async () => {
          const treeShaking = await browser
            .elementByCss('[data-tree-shaking]')
            .text()
          expect(treeShaking).toContain('Used exports')
          expect(treeShaking).toContain('This module')
          expect(treeShaking).toContain('No direct side effects')
          expect(treeShaking).toContain('Including dependencies')
          expect(treeShaking).toContain('May have side effects')
        })
        await browser.elementByCss('[data-tree-shaking-more-exports]').moveTo()
        await retry(async () => {
          expect(
            await browser
              .elementByCss('[data-tree-shaking-more-exports]')
              .text()
          ).toBe('and 2 more')
          const exports = await browser
            .elementByCss('[data-tree-shaking-export-list]')
            .text()
          expect(exports).toContain('first')
          expect(exports).toContain('fifth')
          expect(exports).toContain('fourth')
          expect(exports).toContain('second')
          expect(exports).toContain('seventh')
          expect(exports).toContain('sixth')
          expect(exports).toContain('third')
        })
      } finally {
        await browser.close()
      }
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

        const modules = readAnalyzeModules(
          path.join(defaultOutputPath, 'data', 'modules.data')
        )
        const modulesByPath = (modulePath: string) =>
          modules.filter((module) => module.path.endsWith(modulePath))

        expect(modulesByPath('/app/values.ts')).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              used_exports: ['used'],
              own_side_effects: 'free',
              transitive_side_effects: 'free',
            }),
          ])
        )
        expect(modulesByPath('/app/effect.ts')).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              own_side_effects: 'effectful',
              transitive_side_effects: 'effectful',
            }),
          ])
        )
        expect(modulesByPath('/app/transitive-effect.ts')).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              used_exports: expect.arrayContaining([
                'fifth',
                'first',
                'fourth',
                'second',
                'seventh',
                'sixth',
                'third',
              ]),
              own_side_effects: 'evaluation-free',
              transitive_side_effects: 'effectful',
            }),
          ])
        )
      })
    })
  })
})
