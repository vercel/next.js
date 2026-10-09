import { nextTestSetup } from 'e2e-utils'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { cp } from 'fs/promises'
import packageJson from './package.json'

const exec = promisify(execFile)

describe('next-testing-static-mocks', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    packageJson,
    skipStart: true,
  })

  async function run(...files: string[]) {
    const { stdout, stderr } = await exec(
      process.execPath,
      [join(next.testDir, 'compile.cjs'), ...files],
      {
        cwd: next.testDir,
        env: { ...process.env, NODE_ENV: 'development' },
        maxBuffer: 10 * 1024 * 1024,
        timeout: 90000,
      }
    )
    const internalError =
      /TurbopackInternalError|unexpected Turbopack|telemetry.*(?:global|initialized)|global.*telemetry/i
    expect(stderr).not.toMatch(internalError)
    const marker = 'STATIC_MOCK_RESULTS='
    const line = stdout.split('\n').find((value) => value.startsWith(marker))
    expect(line).toBeDefined()
    const records = JSON.parse(line!.slice(marker.length))
    for (const record of records) {
      expect(record.compilationErrorName ?? '').not.toMatch(internalError)
      expect(record.compilationError ?? '').not.toMatch(internalError)
    }
    return records
  }

  it('hoists async partial factories into the actual graph and isolates the following file', async () => {
    const files = [
      'mocked.js',
      'original.js',
      'conditions.js',
      'typed.ts',
      'jsx.jsx',
      'loader-factory.js',
      'empty.js',
    ]
    const records = await run(...files)
    expect(
      records.map((record) => ({
        file: record.file,
        compilationError: record.compilationError,
        status: record.result?.status,
        diagnostics:
          record.result?.status === 'passed'
            ? undefined
            : record.events?.filter(
                (event: { type: string }) => event.type === 'diagnostic'
              ),
      }))
    ).toEqual(
      files.map((file) => ({
        file,
        compilationError: undefined,
        status: 'passed',
        diagnostics: undefined,
      }))
    )
    for (const record of records) {
      expect(record.compilationError).toBeUndefined()
      expect(record.result.status).toBe('passed')
      expect(
        record.events.filter(
          (event: { type: string }) => event.type === 'case-end'
        )
      ).toHaveLength(1)
    }
    expect(records[0].artifact.moduleMocking).toEqual({ version: 1 })
    expect(records[1].artifact.moduleMocking).toBeUndefined()
    expect(records[2].artifact.moduleMocking).toEqual({ version: 1 })
  })

  it('preserves factory errors and rejects unsupported targets and captures', async () => {
    const [factory, framework, capture] = await run(
      'factory-error.js',
      'framework.js',
      'capture.js'
    )
    expect(factory.compilationError).toBeUndefined()
    expect(factory.result.status).toBe('failed')
    expect(JSON.stringify(factory.events)).toContain(
      'intentional factory failure'
    )
    expect(factory.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'diagnostic',
          diagnostic: expect.objectContaining({
            cause: expect.objectContaining({
              frames: expect.arrayContaining([
                expect.objectContaining({
                  file: expect.stringContaining('/specs/factory-error.js'),
                  line: 4,
                  column: 9,
                  original: true,
                }),
              ]),
            }),
          }),
        }),
      ])
    )
    expect(framework.compilationError).toMatch(/framework|unsupported|React/i)
    expect(capture.compilationError).toMatch(/capture|hoisted/i)
  })
  it('rejects cyclic, client-boundary and query target variants before publication', async () => {
    await cp(
      join(next.testDir, 'cycle-package'),
      join(next.testDir, 'node_modules/next-testing-cycle-package'),
      { recursive: true }
    )
    const [cycle, client, query, loadedClient, packageCycle, aliasQuery] =
      await run(
        'cycle.js',
        'client-target.js',
        'query.js',
        'loaded-client.js',
        'package-cycle.js',
        'alias-query.js'
      )
    expect(cycle.compilationError).toMatch(/cyclic|cycle/i)
    expect(client.compilationError).toMatch(/use client|client.*target/i)
    expect(query.compilationError).toMatch(/query|fragment/i)
    expect(loadedClient.compilationError).toMatch(/use client|client.*target/i)
    expect(packageCycle.compilationError).toMatch(/cyclic|cycle/i)
    expect(aliasQuery.compilationError).toMatch(/query|fragment/i)
    for (const record of [
      cycle,
      client,
      query,
      loadedClient,
      packageCycle,
      aliasQuery,
    ])
      expect(record.artifact).toBeUndefined()
  })
  it('reports nonliteral targets and setup combinations as input errors', async () => {
    const [nonliteral, setup] = await run('nonliteral.js', 'setup-mock.js')
    expect(nonliteral.compilationError).toMatch(/string literal/i)
    expect(setup.compilationError).toMatch(/mocks with setup files/i)
    for (const record of [nonliteral, setup]) {
      expect(record.artifact).toBeUndefined()
    }
  })
})
