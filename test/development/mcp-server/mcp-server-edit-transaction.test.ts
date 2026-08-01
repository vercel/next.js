import { promises as fs } from 'fs'
import path from 'path'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'MCP edit transactions',
  () => {
    const { next, skipped } = nextTestSetup({
      subDir: 'project',
      files: {
        app: new FileRef(
          path.join(__dirname, 'fixtures', 'default-template', 'app')
        ),
        'next.config.js': `
          const path = require('path')
          module.exports = {
            // Exercise project-relative changed paths when Turbopack's filesystem root is the
            // parent of the Next.js project, as it commonly is in a monorepo.
            turbopack: { root: path.dirname(__dirname) },
          }
        `,
      },
      env: { __NEXT_EXPERIMENTAL_EDIT_TRANSACTIONS: 'true' },
    })

    if (skipped) return

    beforeAll(async () => {
      await next.patchFile(
        'app/transaction-target.tsx',
        'export function TransactionTarget() { return <h1>Home Page</h1> }\n'
      )
      await next.patchFile('app/page.tsx', (source) =>
        source
          .replace(
            "import Link from 'next/link'",
            "import Link from 'next/link'\nimport { TransactionTarget } from './transaction-target'"
          )
          .replace('<h1>Home Page</h1>', '<TransactionTarget />')
      )
    })

    let requestId = 0
    async function callMcpTool(
      name: string,
      args: Record<string, unknown> = {},
      allowError = false
    ) {
      const response = await fetch(`${next.url}/_next/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `edit-transaction-${++requestId}`,
          method: 'tools/call',
          params: { name, arguments: args },
        }),
      })
      const body = await response.text()
      const match = body.match(/data: ({.*})/s)
      expect(response.ok).toBe(true)
      expect(match).toBeTruthy()
      const envelope = JSON.parse(match![1])
      expect(envelope.error).toBeUndefined()
      if (!allowError) expect(envelope.result?.isError).not.toBe(true)
      return {
        isError: envelope.result?.isError === true,
        value: JSON.parse(envelope.result?.content?.[0]?.text ?? '{}'),
      }
    }

    const beginTransaction = async (changedPaths: string[] = []) =>
      (await callMcpTool('begin_edit_transaction', { changedPaths })).value as {
        token: string
        leaseMs: number
        maximumDurationMs: number
      }

    const endTransaction = async (
      token: string,
      _declaredChangedPaths: string[] = []
    ) =>
      (
        await callMcpTool('end_edit_transaction', {
          token,
        })
      ).value as {
        token: string
        status: string
      }

    it('holds invalidations until the last opaque nested token ends', async () => {
      const browser = await next.browser('/')
      const original = await next.readFile('app/transaction-target.tsx')
      const first = await beginTransaction(['app/transaction-target.tsx'])
      const second = await beginTransaction(['app/transaction-target.tsx'])
      let firstOpen = true
      let secondOpen = true
      try {
        expect(first.token).toMatch(/^[0-9a-f-]{36}$/)
        expect(second.token).toMatch(/^[0-9a-f-]{36}$/)
        expect(first.token).not.toBe(second.token)
        expect(first.leaseMs).toBeGreaterThan(0)
        expect(first.leaseMs).toBeLessThanOrEqual(4000)

        await next.patchFile('app/transaction-target.tsx', (source) =>
          source.replace('Home Page', 'Nested Transaction Complete')
        )
        await waitFor(750)
        expect(
          await browser.eval('document.querySelector("h1")?.textContent')
        ).toBe('Home Page')

        expect(
          await endTransaction(first.token, ['app/transaction-target.tsx'])
        ).toMatchObject({
          token: first.token,
          status: 'held_by_other_transaction',
        })
        firstOpen = false
        await waitFor(750)
        expect(
          await browser.eval('document.querySelector("h1")?.textContent')
        ).toBe('Home Page')

        expect(
          await endTransaction(second.token, ['app/transaction-target.tsx'])
        ).toMatchObject({ token: second.token, status: 'flushed' })
        secondOpen = false
        await retry(async () => {
          expect(
            await browser.eval('document.querySelector("h1")?.textContent')
          ).toBe('Nested Transaction Complete')
        })
      } finally {
        if (firstOpen)
          await endTransaction(first.token, ['app/transaction-target.tsx'])
        if (secondOpen)
          await endTransaction(second.token, ['app/transaction-target.tsx'])
        await next.patchFile('app/transaction-target.tsx', original)
        await browser.close()
      }
    })

    it('hides an incomplete import until all changed paths are committed', async () => {
      const browser = await next.browser('/')
      const original = await next.readFile('app/transaction-target.tsx')
      const { token } = await beginTransaction([
        'app/transaction-target.tsx',
        'app/transaction-value.ts',
      ])
      let transactionOpen = true
      try {
        await next.patchFile('app/transaction-target.tsx', (source) =>
          source
            .replace(
              'export function TransactionTarget',
              "import { transactionValue } from './transaction-value'\n\nexport function TransactionTarget"
            )
            .replace('<h1>Home Page</h1>', '<h1>{transactionValue}</h1>')
        )
        await waitFor(250)
        expect(
          await browser.eval('document.querySelector("h1")?.textContent')
        ).toBe('Home Page')

        await next.patchFile(
          'app/transaction-value.ts',
          "export const transactionValue = 'Import Complete'\n"
        )
        await waitFor(250)
        expect(
          await browser.eval('document.querySelector("h1")?.textContent')
        ).toBe('Home Page')

        expect(
          await endTransaction(token, [
            'app/transaction-target.tsx',
            'app/transaction-value.ts',
          ])
        ).toMatchObject({ token, status: 'flushed' })
        transactionOpen = false
        await retry(async () => {
          expect(
            await browser.eval('document.querySelector("h1")?.textContent')
          ).toBe('Import Complete')
        })
      } finally {
        if (transactionOpen) {
          await endTransaction(token, [
            'app/transaction-target.tsx',
            'app/transaction-value.ts',
          ])
        }
        await next.patchFile('app/transaction-target.tsx', original)
        await next.deleteFile('app/transaction-value.ts')
        await browser.close()
      }
    })

    it('discovers a source dependency created beneath declared new directories', async () => {
      const browser = await next.browser('/')
      const targetFile = 'app/transaction-target.tsx'
      const original = await next.readFile(targetFile)
      const relativeFile = 'app/edit-transaction-created/nested/value.ts'
      const changedPaths = [
        targetFile,
        'app/edit-transaction-created',
        'app/edit-transaction-created/nested',
        relativeFile,
      ]
      const absoluteDirectory = path.join(
        next.testDir,
        'app/edit-transaction-created'
      )
      const absoluteFile = path.join(next.testDir, relativeFile)
      const { token } = await beginTransaction(changedPaths)
      let transactionOpen = true
      try {
        await next.patchFile(targetFile, (source) =>
          source
            .replace(
              'export function TransactionTarget',
              "import { nestedValue } from './edit-transaction-created/nested/value'\n\nexport function TransactionTarget"
            )
            .replace('<h1>Home Page</h1>', '<h1>{nestedValue}</h1>')
        )
        await waitFor(250)
        expect(
          await browser.eval('document.querySelector("h1")?.textContent')
        ).toBe('Home Page')

        await fs.mkdir(path.dirname(absoluteFile), { recursive: true })
        await fs.writeFile(
          absoluteFile,
          "export const nestedValue = 'Nested Dependency Complete'\n"
        )
        await waitFor(250)
        expect(
          await browser.eval('document.querySelector("h1")?.textContent')
        ).toBe('Home Page')

        expect(await endTransaction(token, changedPaths)).toMatchObject({
          token,
          status: 'flushed',
        })
        transactionOpen = false
        await retry(async () => {
          expect(
            await browser.eval('document.querySelector("h1")?.textContent')
          ).toBe('Nested Dependency Complete')
        })
      } finally {
        if (transactionOpen) await endTransaction(token, changedPaths)
        await next.patchFile(targetFile, original)
        await fs.rm(absoluteDirectory, { recursive: true, force: true })
        await browser.close()
        await waitFor(500)
      }
    })

    it('renews only the matching lease for a long bounded edit', async () => {
      const browser = await next.browser('/')
      const original = await next.readFile('app/transaction-target.tsx')
      const renewedTransaction = await beginTransaction([
        'app/transaction-target.tsx',
      ])
      const expiringTransaction = await beginTransaction([
        'app/transaction-target.tsx',
      ])
      let renewedOpen = true
      let expiringOpen = true
      try {
        await next.patchFile('app/transaction-target.tsx', (source) =>
          source.replace('Home Page', 'Renewed Transaction Complete')
        )
        const renew = async () => {
          const renewal = (
            await callMcpTool('renew_edit_transaction', {
              token: renewedTransaction.token,
            })
          ).value as { token: string; status: string; leaseMs: number }
          expect(renewal).toMatchObject({
            token: renewedTransaction.token,
            status: 'renewed',
          })
          expect(renewal.leaseMs).toBeGreaterThan(0)
          expect(renewal.leaseMs).toBeLessThanOrEqual(4000)
        }
        await waitFor(1000)
        await renew()
        await waitFor(2500)
        await renew()
        await waitFor(1500)
        expect(
          await browser.eval('document.querySelector("h1")?.textContent')
        ).toBe('Home Page')

        expect(
          await endTransaction(expiringTransaction.token, [
            'app/transaction-target.tsx',
          ])
        ).toMatchObject({
          token: expiringTransaction.token,
          status: 'expired',
        })
        expiringOpen = false
        expect(
          await endTransaction(renewedTransaction.token, [
            'app/transaction-target.tsx',
          ])
        ).toMatchObject({
          token: renewedTransaction.token,
          status: 'flushed',
        })
        renewedOpen = false
        await retry(async () => {
          expect(
            await browser.eval('document.querySelector("h1")?.textContent')
          ).toBe('Renewed Transaction Complete')
        })
      } finally {
        if (expiringOpen) {
          await endTransaction(expiringTransaction.token, [
            'app/transaction-target.tsx',
          ])
        }
        if (renewedOpen) {
          await endTransaction(renewedTransaction.token, [
            'app/transaction-target.tsx',
          ])
        }
        await next.patchFile('app/transaction-target.tsx', original)
        await browser.close()
      }
    })

    it('rejects unsupported paths before a transaction begins', async () => {
      const outside = await callMcpTool(
        'begin_edit_transaction',
        { changedPaths: ['../outside.ts'] },
        true
      )
      expect(outside.isError).toBe(true)
      expect(outside.value.error).toContain('leaves the project root')

      for (const changedPath of [
        '.env.local',
        'tsconfig.json',
        'jsconfig.json',
        'next.config.js',
        'app/page.tsx',
        'app/api/route.ts',
        'app/layout.tsx',
        'middleware.ts',
        'src/instrumentation.ts',
      ]) {
        const unsupported = await callMcpTool(
          'begin_edit_transaction',
          { changedPaths: [changedPath] },
          true
        )
        expect(unsupported.isError).toBe(true)
        expect(unsupported.value.error).toContain(
          'watched outside the Turbopack source transaction'
        )
      }

      const { token } = await beginTransaction(['app/transaction-target.tsx'])
      expect(await endTransaction(token)).toMatchObject({
        token,
        status: 'flushed',
      })
    })

    it('acknowledges the final flush before a subsequent begin', async () => {
      const first = await beginTransaction()
      await expect(endTransaction(first.token, [])).resolves.toMatchObject({
        token: first.token,
        status: 'flushed',
      })
      const second = await beginTransaction()
      await expect(endTransaction(second.token, [])).resolves.toMatchObject({
        token: second.token,
        status: 'flushed',
      })
    })

    it('forces progress after an abandoned transaction', async () => {
      const browser = await next.browser('/')
      const original = await next.readFile('app/transaction-target.tsx')
      const transactionStartedAt = Date.now()
      const { token, leaseMs } = await beginTransaction([
        'app/transaction-target.tsx',
      ])
      try {
        await next.patchFile('app/transaction-target.tsx', (source) =>
          source.replace('Home Page', 'Timeout Released')
        )
        await waitFor(250)
        expect(
          await browser.eval('document.querySelector("h1")?.textContent')
        ).toBe('Home Page')

        await retry(async () => {
          expect(
            await browser.eval('document.querySelector("h1")?.textContent')
          ).toBe('Timeout Released')
        }, 7000)
        expect(Date.now() - transactionStartedAt).toBeGreaterThanOrEqual(
          leaseMs
        )
        expect(
          await endTransaction(token, ['app/transaction-target.tsx'])
        ).toMatchObject({
          token,
          status: 'expired',
        })
      } finally {
        await next.patchFile('app/transaction-target.tsx', original)
        await browser.close()
      }
    })
  }
)
