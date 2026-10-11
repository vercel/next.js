import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { commitSnapshotUpdates } from 'next/dist/experimental/testing/assertions/snapshots'

it('commits in a parent with an existing assertion host without loading another matcher registry', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'next-snapshot-parent-'))
  const testPath = join(directory, 'parent.test.ts')
  const path = join(directory, '__snapshots__', 'parent.test.ts.snap')
  await mkdir(join(directory, '__snapshots__'))
  await writeFile(path, 'original')
  try {
    await commitSnapshotUpdates(testPath, [
      { path, content: 'updated', previousContent: 'original' },
    ])
    expect(await readFile(path, 'utf8')).toBe('updated')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('coordinates external, inline, and raw updates against their original bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'next-snapshot-set-'))
  const testPath = join(directory, 'parent.test.ts')
  const externalPath = join(directory, '__snapshots__', 'parent.test.ts.snap')
  const rawPath = join(directory, 'parent.txt')
  const source = 'expect(value).toMatchInlineSnapshot()\n'
  await mkdir(join(directory, '__snapshots__'))
  await writeFile(testPath, source)
  await writeFile(externalPath, 'external-original')
  try {
    await commitSnapshotUpdates(
      testPath,
      [
        {
          path: externalPath,
          content: 'external-updated',
          previousContent: 'external-original',
        },
        { path: testPath, content: 'inline-updated', previousContent: source },
        { path: rawPath, content: 'raw-updated', previousContent: null },
      ],
      {
        sourceHash: createHash('sha256').update(source).digest('hex'),
      }
    )
    expect(await readFile(externalPath, 'utf8')).toBe('external-updated')
    expect(await readFile(testPath, 'utf8')).toBe('inline-updated')
    expect(await readFile(rawPath, 'utf8')).toBe('raw-updated')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('refuses a stale compiled source revision without partially writing the set', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'next-snapshot-stale-'))
  const testPath = join(directory, 'parent.test.ts')
  const externalPath = join(directory, '__snapshots__', 'parent.test.ts.snap')
  await mkdir(join(directory, '__snapshots__'))
  await writeFile(testPath, 'current source')
  await writeFile(externalPath, 'external-original')
  try {
    await expect(
      commitSnapshotUpdates(
        testPath,
        [
          {
            path: externalPath,
            content: 'external-updated',
            previousContent: 'external-original',
          },
          {
            path: testPath,
            content: 'inline-updated',
            previousContent: 'current source',
          },
        ],
        {
          sourceHash: createHash('sha256')
            .update('compiled source')
            .digest('hex'),
        }
      )
    ).rejects.toThrow('does not match the compiled test revision')
    expect(await readFile(externalPath, 'utf8')).toBe('external-original')
    expect(await readFile(testPath, 'utf8')).toBe('current source')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

jest.mock('next/dist/experimental/testing/execution/process', () => ({
  runTestProcess: jest.fn(),
}))

import { executeWithEnvironment } from 'next/dist/experimental/testing/execution/execute'
import { runTestProcess } from 'next/dist/experimental/testing/execution/process'
import type { WorkerInput } from 'next/dist/experimental/testing/execution/protocol'
import type {
  CompiledTestArtifact,
  ExecuteTestOptions,
} from 'next/dist/experimental/testing/contracts'

const runWorker = jest.mocked(runTestProcess)

describe('parent-authorized snapshot updates', () => {
  let directory: string
  let path: string
  let options: ExecuteTestOptions
  let artifact: CompiledTestArtifact
  let cacheDirectory: string | undefined
  const onEvent = jest.fn()
  const updates = () => [
    { path, content: 'updated', previousContent: 'original' },
  ]

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'next-snapshot-deferred-'))
    path = join(directory, '__snapshots__', 'parent.test.ts.snap')
    await mkdir(join(directory, '__snapshots__'))
    await writeFile(path, 'original')
    const entry = {
      id: 'node:parent',
      file: join(directory, 'parent.test.ts'),
      profile: {
        id: 'node',
        mode: 'development' as const,
        environment: 'node' as const,
        runtime: 'nodejs' as const,
        bundler: 'turbopack' as const,
      },
    }
    artifact = {
      version: 2,
      kind: 'node',
      entryId: entry.id,
      profile: entry.profile,
      revision: 'revision',
      rootDir: directory,
      entryPath: 'parent.js',
      files: [],
      diagnostics: [],
    }
    options = {
      runId: 'snapshot-run',
      projectDir: directory,
      entry,
      setupFiles: [],
      updateSnapshots: true,
      testTimeout: 1000,
      hookTimeout: 1000,
      fileTimeout: 5000,
      signal: new AbortController().signal,
      onEvent,
    }
    onEvent.mockClear()
    runWorker.mockReset()
    cacheDirectory = undefined
  })

  afterEach(async () => {
    jest.restoreAllMocks()
    await rm(directory, { recursive: true, force: true })
    if (cacheDirectory)
      await rm(cacheDirectory, { recursive: true, force: true })
  })

  function completeWorker(
    exit: Awaited<ReturnType<typeof runTestProcess>> = {
      reason: 'exit',
      code: 0,
      signal: null,
    }
  ) {
    runWorker.mockImplementation(async (_worker, workerOptions) => {
      cacheDirectory = (workerOptions.input as WorkerInput).cacheScope.directory
      workerOptions.onMessage({
        type: 'complete',
        result: { entryId: artifact.entryId, status: 'passed', durationMs: 1 },
        snapshotUpdates: updates(),
      })
      return exit
    })
  }

  it('defers clean worker updates until the parent authorizes a write, after cache cleanup', async () => {
    completeWorker()
    const defer = jest.fn(
      async (file: string, staged: ReturnType<typeof updates>) => {
        expect(file).toBe(options.entry.file)
        expect(staged).toEqual(updates())
        expect(await readFile(path, 'utf8')).toBe('original')
        await expect(stat(cacheDirectory!)).rejects.toMatchObject({
          code: 'ENOENT',
        })
      }
    )
    expect(
      await executeWithEnvironment(artifact, options, process.env, defer)
    ).toMatchObject({ status: 'passed' })
    expect(defer).toHaveBeenCalledTimes(1)
    expect(await readFile(path, 'utf8')).toBe('original')
    await commitSnapshotUpdates(options.entry.file, updates())
    expect(await readFile(path, 'utf8')).toBe('updated')
  })

  it.each([
    { reason: 'exit' as const, code: 1, signal: null, status: 'failed' },
    {
      reason: 'cancelled' as const,
      code: null,
      signal: null,
      status: 'cancelled',
    },
  ])(
    'rejects provisional updates after $reason with code $code',
    async ({ status, ...exit }) => {
      completeWorker(exit)
      const defer = jest.fn()
      expect(
        await executeWithEnvironment(artifact, options, process.env, defer)
      ).toMatchObject({ status })
      expect(defer).not.toHaveBeenCalled()
      expect(await readFile(path, 'utf8')).toBe('original')
    }
  )

  it('rejects provisional updates when the cache lease cannot be cleaned up', async () => {
    completeWorker()
    const defer = jest.fn()
    jest
      .spyOn(require('fs/promises'), 'rm')
      .mockRejectedValueOnce(new Error('cache cleanup failed'))
    await expect(
      executeWithEnvironment(artifact, options, process.env, defer)
    ).rejects.toThrow('cache cleanup failed')
    expect(defer).not.toHaveBeenCalled()
    expect(await readFile(path, 'utf8')).toBe('original')
  })

  it('reports failed authorization as a cleanup failure without writing', async () => {
    completeWorker()
    const defer = jest.fn(async () => {
      throw new Error('parent rejected stale run')
    })
    expect(
      await executeWithEnvironment(artifact, options, process.env, defer)
    ).toMatchObject({ status: 'failed' })
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'diagnostic',
        diagnostic: expect.objectContaining({
          phase: 'cleanup',
          message: 'parent rejected stale run',
        }),
      })
    )
    expect(await readFile(path, 'utf8')).toBe('original')
  })

  it('commits normal one-shot updates without a deferred callback', async () => {
    completeWorker()
    expect(
      await executeWithEnvironment(artifact, options, process.env)
    ).toMatchObject({ status: 'passed' })
    expect(await readFile(path, 'utf8')).toBe('updated')
  })

  it('commits production updates after the authoritative worker closes', async () => {
    artifact.profile.mode = 'production'
    options.entry.profile.mode = 'production'
    completeWorker()
    expect(
      await executeWithEnvironment(artifact, options, process.env)
    ).toMatchObject({ status: 'passed' })
    expect(await readFile(path, 'utf8')).toBe('updated')
  })
})
