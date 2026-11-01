import { mkdtemp, writeFile, readFile, rm, realpath } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { createHash, randomUUID } from 'node:crypto'
import {
  normalizeTestConfig,
  openTestConfiguration,
} from 'next/dist/experimental/testing/config'
import { evaluateWatchTriggers } from 'next/dist/experimental/testing/config-watch-triggers'
import { watchTests } from 'next/dist/experimental/testing/watch-orchestrator'
import { watchTestFiles } from 'next/dist/experimental/testing/incremental/watch-files'
import { runWatchProcess } from 'next/dist/experimental/testing/watch-process'

jest.mock('next/dist/experimental/testing/config', () => ({
  ...jest.requireActual('next/dist/experimental/testing/config'),
  openTestConfiguration: jest.fn(),
}))
jest.mock('next/dist/experimental/testing/incremental/watch-files', () => ({
  watchTestFiles: jest.fn(),
}))
jest.mock('next/dist/experimental/testing/watch-process', () => ({
  WatchOwnershipError: class WatchOwnershipError extends Error {},
  runWatchProcess: jest.fn(),
}))

const sha = (value: string) => createHash('sha256').update(value).digest('hex')
function gate() {
  let count = 0
  const waiting: { count: number; resolve(): void }[] = []
  return {
    arrived() {
      count++
      for (const waiter of waiting) if (count >= waiter.count) waiter.resolve()
    },
    waitFor(next: number) {
      return count >= next
        ? Promise.resolve()
        : new Promise<void>((resolve) => waiting.push({ count: next, resolve }))
    },
  }
}

it.each([
  { certified: false, mapped: 'alpha.test.mjs' },
  { certified: true, mapped: 'alpha.test.mjs' },
  { certified: true, mapped: '' },
])(
  'uses explicit mapping before dependency fallback and certifies only current config: %j',
  async ({ certified, mapped }) => {
    const directory = await realpath(
      await mkdtemp(path.join(tmpdir(), 'next-trigger-consumer-'))
    )
    const report = path.join(directory, 'result.json')
    const configFile = path.join(directory, 'vitest.config.mjs')
    const shared = path.join(directory, 'shared.mjs')
    const payload = path.join(directory, 'payload.mjs')
    await writeFile(configFile, 'export default {test:{}}\n')
    await writeFile(shared, 'export const shared=0\n')
    await writeFile(payload, 'export const payload=0\n')
    await writeFile(
      path.join(directory, 'alpha.test.mjs'),
      "import {test} from 'vitest';test('alpha',()=>{})\n"
    )
    await writeFile(
      path.join(directory, 'beta.test.mjs'),
      "import {test} from 'vitest';test('beta',()=>{})\n"
    )
    const controller = new AbortController()
    const ready = gate()
    const requests: any[] = []
    const errors: string[] = []
    let changed: Parameters<typeof watchTestFiles>[0]['onChange'] | undefined
    const close = jest.fn(async () => {})
    const update = jest.fn(async () => {})
    jest.mocked(watchTestFiles).mockImplementation(async (options) => {
      changed = options.onChange
      return { close, update }
    })
    const definitions = [
      {
        pattern: /(?:payload|shared)\.mjs$/,
        testsToRun(id: string) {
          return id.endsWith('payload.mjs') ? mapped : null
        },
      },
    ]
    const configuration = {
      config: normalizeTestConfig({
        test: {
          projects: [
            { test: { name: 'alpha', include: ['alpha.test.mjs'] } },
            { test: { name: 'beta', include: ['beta.test.mjs'] } },
          ],
        },
      }),
      hasWatchTriggers: true,
      compilerTransformNames: [],
      compilerTransforms: {},
      compilerInputsForProjects: () => [],
      watchInputs: [configFile],
      retainWatchTriggersForWatch: jest.fn(async () => true),
      certifyWatchTriggerSelection: jest.fn(async () => certified),
      retainCompilerTransformsForWatch: async () => false,
      retainGlobalSetupForWatch: async () => false,
      evaluateWatchTriggers: jest.fn(async (files: readonly string[]) =>
        evaluateWatchTriggers({ definitions }, directory, files)
      ),
      setup: async () => {},
      dispose: jest.fn(async () => {}),
    }
    jest
      .mocked(openTestConfiguration)
      .mockResolvedValue(
        configuration as unknown as Awaited<
          ReturnType<typeof openTestConfiguration>
        >
      )
    jest
      .mocked(runWatchProcess)
      .mockImplementation(async (request: any, options: any) => {
        requests.push(request)
        if (request.operation === 'metadata')
          return {
            operation: 'metadata',
            directories: {
              directories: [directory],
              outputDirectories: [],
              outputFiles: [report],
            },
          }
        if (request.operation === 'plan') {
          const entries = []
          for (const project of request.projects)
            for (const entry of project.entries) {
              const hash = sha(await readFile(entry.file, 'utf8'))
              const dependency = entry.file.endsWith('alpha.test.mjs')
                ? shared
                : payload
              entries.push({
                id: entry.id,
                file: entry.file,
                sha256: hash,
                dependencies: {
                  version: 1,
                  kind: 'native-module-sources',
                  complete: true,
                  entry: { file: entry.file, sha256: hash },
                  files: [
                    { file: entry.file, sha256: hash },
                    {
                      file: dependency,
                      sha256: sha(await readFile(dependency, 'utf8')),
                    },
                  ],
                },
              })
            }
          return {
            operation: 'plan',
            plan: {
              version: 1,
              entries,
              configuration: {
                complete: request.certifiedTestConfig,
                files: [
                  {
                    file: configFile,
                    sha256: sha(await readFile(configFile, 'utf8')),
                  },
                ],
              },
            },
          }
        }
        const envelope = {
          version: 1,
          runId: randomUUID(),
          timestamp: Date.now(),
        }
        options.onEvent({ ...envelope, type: 'run-start' })
        for (const project of request.projects)
          for (const entry of project.entries) {
            options.onEvent({ ...envelope, type: 'file-start', entry })
            const name = path.basename(entry.file).split('.')[0]
            const task = {
              entryId: entry.id,
              caseId: entry.id + '/case',
              name,
              testName: name,
              ancestors: [],
              attempt: { id: entry.id + '/attempt', retry: 0, repeat: 0 },
              mode: 'run',
            }
            options.onEvent({ ...envelope, type: 'case-start', ...task })
            options.onEvent({
              ...envelope,
              type: 'case-end',
              ...task,
              status: 'passed',
              durationMs: 0,
              errors: [],
              meta: {},
              tags: [],
              annotations: [],
            })
            options.onEvent({
              ...envelope,
              type: 'file-end',
              entryId: entry.id,
              status: 'passed',
              durationMs: 0,
            })
          }
        options.onEvent({
          ...envelope,
          type: 'run-end',
          status: 'passed',
          durationMs: 0,
        })
        const count = request.projects.reduce(
          (total: number, project: any) => total + project.entries.length,
          0
        )
        const counts = { passed: count, failed: 0, skipped: 0, cancelled: 0 }
        return {
          operation: 'run',
          result: {
            runId: envelope.runId,
            status: 'passed',
            files: counts,
            cases: counts,
            attempts: counts,
            errors: 0,
            warnings: 0,
            attachments: 0,
            unsafeCleanup: false,
          },
        }
      })
    const running = watchTests(directory, {
      signal: controller.signal,
      resultReporters: ['json'],
      outputFile: report,
      write(text) {
        if (/file changes/.test(text)) ready.arrived()
      },
      writeError(text) {
        errors.push(text)
      },
    })
    try {
      await ready.waitFor(1)
      await writeFile(payload, 'export const payload=1\n')
      changed!({ changed: [payload], removed: [] })
      await ready.waitFor(2)
      expect(
        requests.filter((request) => request.operation === 'plan')
      ).toHaveLength(0)
      const mappedReport = JSON.parse(await readFile(report, 'utf8'))
      expect(
        mappedReport.testResults.map((file: any) => path.basename(file.name))
      ).toEqual(mapped ? ['alpha.test.mjs'] : [])
      if (!mapped) {
        expect(mappedReport.success).toBe(false)
        expect(mappedReport.numTotalTests).toBe(0)
        expect(mappedReport.numTotalTestSuites).toBe(0)
        expect(
          requests.filter((request) => request.operation === 'run')
        ).toHaveLength(1)
        expect(configuration.evaluateWatchTriggers).toHaveBeenCalledTimes(1)
        expect(errors).toEqual([])
        return
      }
      await writeFile(shared, 'export const shared=1\n')
      changed!({ changed: [shared], removed: [] })
      await ready.waitFor(3)
      const plans = requests.filter((request) => request.operation === 'plan')
      expect(plans).toHaveLength(1)
      expect(plans[0].certifiedTestConfig).toBe(certified)
      expect(
        JSON.parse(await readFile(report, 'utf8')).testResults.map(
          (file: any) => path.basename(file.name)
        )
      ).toEqual(
        certified ? ['alpha.test.mjs'] : ['alpha.test.mjs', 'beta.test.mjs']
      )
      expect(configuration.evaluateWatchTriggers).toHaveBeenCalledTimes(2)
      expect(errors).toEqual([])
    } finally {
      controller.abort(new Error('owned supplied-transport test completed'))
      await running
      expect(close).toHaveBeenCalledTimes(1)
      await rm(directory, { recursive: true, force: true })
      jest.clearAllMocks()
    }
  }
)
