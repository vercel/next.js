import { promises as fs } from 'fs'
import path from 'path'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'

const explicitPollInterval = process.env
  .NEXT_TEST_EDIT_TRANSACTION_POLL_INTERVAL_MS
  ? Number(process.env.NEXT_TEST_EDIT_TRANSACTION_POLL_INTERVAL_MS)
  : undefined
const watcherModes =
  explicitPollInterval === undefined
    ? [
        { name: 'recommended watcher', pollIntervalMs: undefined },
        { name: '100ms polling watcher', pollIntervalMs: 100 },
      ]
    : [
        {
          name: `${explicitPollInterval}ms polling watcher`,
          pollIntervalMs: explicitPollInterval,
        },
      ]
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip).each(watcherModes)(
  'MCP edit transactions ($name)',
  ({ pollIntervalMs }) => {
    const { next, skipped } = nextTestSetup({
      subDir: 'project',
      files: {
        app: new FileRef(
          path.join(__dirname, 'fixtures', 'default-template', 'app')
        ),
        'next.config.js': `
          const path = require('path')
          module.exports = {
            // Match the monorepo layout used by v0: the Turbopack root is above
            // the Next.js project and MCP paths are project-relative.
            turbopack: { root: path.dirname(__dirname) },
            watchOptions: ${
              pollIntervalMs === undefined
                ? 'undefined'
                : `{ pollIntervalMs: ${pollIntervalMs} }`
            },
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
      const result = {
        isError: envelope.result?.isError === true,
        value: JSON.parse(envelope.result?.content?.[0]?.text ?? '{}'),
      }
      if (!allowError && result.isError) {
        throw new Error(result.value.error ?? `MCP tool ${name} failed`)
      }
      return result
    }

    const beginTransaction = async (changedPaths: string[]) =>
      (await callMcpTool('begin_edit_transaction', { changedPaths })).value as {
        token?: string
        status: 'started' | 'busy'
        leaseMs?: number
        maximumDurationMs?: number
        retryAfterMs?: number
      }

    const endTransaction = async (token: string) =>
      (await callMcpTool('end_edit_transaction', { token })).value as {
        token: string
        status: 'flushed' | 'expired' | 'unknown'
      }

    async function runEditTransaction(
      changedPaths: string[],
      edit: () => Promise<void>
    ) {
      let transaction: Awaited<ReturnType<typeof beginTransaction>> | undefined
      await retry(async () => {
        transaction = await beginTransaction(changedPaths)
        expect(transaction.status).toBe('started')
      })
      try {
        await edit()
      } finally {
        expect(await endTransaction(transaction!.token!)).toMatchObject({
          token: transaction!.token,
          status: 'flushed',
        })
      }
    }

    async function openHomePage() {
      const readinessTimeout = Math.max(15_000, (pollIntervalMs ?? 0) * 10)
      await retry(async () => {
        const response = await next.fetch('/')
        expect(response.status).toBe(200)
        expect(await response.text()).toContain('Home Page')
      }, readinessTimeout)

      const browser = await next.browser('/')
      await retry(async () => {
        expect(
          await browser.eval('document.querySelector("h1")?.textContent')
        ).toBe('Home Page')
      }, 5_000)
      return browser
    }

    it('publishes an incomplete multi-file import as one HMR update', async () => {
      const browser = await openHomePage()
      const targetFile = 'app/transaction-target.tsx'
      const valueFile = 'app/transaction-value.ts'
      const original = await next.readFile(targetFile)
      const transaction = await beginTransaction([targetFile, valueFile])
      expect(transaction).toMatchObject({ status: 'started' })
      expect(transaction.token).toMatch(/^[0-9a-f-]{36}$/)
      expect(transaction.leaseMs).toBeGreaterThan(0)
      expect(transaction.leaseMs).toBeLessThanOrEqual(4_000)
      expect(transaction.maximumDurationMs).toBe(60_000)
      const token = transaction.token!
      let transactionOpen = true

      try {
        // The watcher supports one transaction at a time. Callers retry instead
        // of silently joining an unrelated agent edit.
        expect(await beginTransaction([targetFile])).toMatchObject({
          status: 'busy',
          retryAfterMs: 25,
        })

        await next.patchFile(targetFile, (source) =>
          source
            .replace(
              'export function TransactionTarget',
              "import { transactionValue } from './transaction-value'\n\nexport function TransactionTarget"
            )
            .replace('<h1>Home Page</h1>', '<h1>{transactionValue}</h1>')
        )
        await waitFor(750)
        expect(
          await browser.eval('document.querySelector("h1")?.textContent')
        ).toBe('Home Page')

        await next.patchFile(
          valueFile,
          "export const transactionValue = 'Import Complete'\n"
        )
        await waitFor(750)
        expect(
          await browser.eval('document.querySelector("h1")?.textContent')
        ).toBe('Home Page')

        expect(await endTransaction(token)).toMatchObject({
          token,
          status: 'flushed',
        })
        transactionOpen = false
        await retry(async () => {
          expect(
            await browser.eval('document.querySelector("h1")?.textContent')
          ).toBe('Import Complete')
        })
        expect(await endTransaction(token)).toMatchObject({
          token,
          status: 'unknown',
        })
      } finally {
        if (transactionOpen) await endTransaction(token)
        await runEditTransaction([targetFile, valueFile], async () => {
          await next.patchFile(targetFile, original)
          await next.deleteFile(valueFile)
        })
        await browser.close()
      }
    })

    it('discovers a declared dependency created beneath new directories', async () => {
      const browser = await openHomePage()
      const targetFile = 'app/transaction-target.tsx'
      const original = await next.readFile(targetFile)
      const relativeFile = 'app/edit-transaction-created/nested/value.ts'
      const changedPaths = [targetFile, relativeFile]
      const absoluteDirectory = path.join(
        next.testDir,
        'app/edit-transaction-created'
      )
      const absoluteFile = path.join(next.testDir, relativeFile)
      const transaction = await beginTransaction(changedPaths)
      expect(transaction.status).toBe('started')
      const token = transaction.token!
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
        await fs.mkdir(path.dirname(absoluteFile), { recursive: true })
        await fs.writeFile(
          absoluteFile,
          "export const nestedValue = 'Nested Dependency Complete'\n"
        )
        await waitFor(750)
        expect(
          await browser.eval('document.querySelector("h1")?.textContent')
        ).toBe('Home Page')

        expect(await endTransaction(token)).toMatchObject({
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
        if (transactionOpen) await endTransaction(token)
        await runEditTransaction(changedPaths, async () => {
          await next.patchFile(targetFile, original)
          await fs.rm(absoluteDirectory, { recursive: true, force: true })
        })
        await browser.close()
        await waitFor(500)
      }
    })

    it('renews a long edit and releases an abandoned edit automatically', async () => {
      const browser = await openHomePage()
      const targetFile = 'app/transaction-target.tsx'
      const original = await next.readFile(targetFile)
      const transaction = await beginTransaction([targetFile])
      expect(transaction.status).toBe('started')
      const token = transaction.token!
      let transactionOpen = true

      try {
        await next.patchFile(targetFile, (source) =>
          source.replace('Home Page', 'Renewed Transaction Complete')
        )
        await waitFor(2_000)
        expect(
          (
            await callMcpTool('renew_edit_transaction', {
              token,
            })
          ).value
        ).toMatchObject({ token, status: 'renewed' })
        await waitFor(2_000)
        expect(
          await browser.eval('document.querySelector("h1")?.textContent')
        ).toBe('Home Page')

        expect(await endTransaction(token)).toMatchObject({
          token,
          status: 'flushed',
        })
        transactionOpen = false
        await retry(async () => {
          expect(
            await browser.eval('document.querySelector("h1")?.textContent')
          ).toBe('Renewed Transaction Complete')
        })

        const abandoned = await beginTransaction([targetFile])
        expect(abandoned.status).toBe('started')
        const abandonedAt = Date.now()
        await next.patchFile(targetFile, (source) =>
          source.replace(
            'Renewed Transaction Complete',
            'Abandoned Transaction Released'
          )
        )
        await retry(async () => {
          expect(
            await browser.eval('document.querySelector("h1")?.textContent')
          ).toBe('Abandoned Transaction Released')
        }, 15_000)
        expect(Date.now() - abandonedAt).toBeGreaterThanOrEqual(
          abandoned.leaseMs!
        )
        expect(await endTransaction(abandoned.token!)).toMatchObject({
          token: abandoned.token,
          status: 'unknown',
        })
      } finally {
        if (transactionOpen) await endTransaction(token)
        await runEditTransaction([targetFile], async () => {
          await next.patchFile(targetFile, original)
        })
        await browser.close()
      }
    })

    it('rejects paths handled by independent dev-server watchers', async () => {
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
        'app/icon.tsx',
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

      const transaction = await beginTransaction(['app/transaction-target.tsx'])
      expect(transaction.status).toBe('started')
      expect(await endTransaction(transaction.token!)).toMatchObject({
        token: transaction.token,
        status: 'flushed',
      })
    })
  }
)
