import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import {
  combineSnapshotUpdatePlans,
  commitSnapshotUpdates,
  recoverSnapshotUpdates,
} from 'next/dist/experimental/testing/assertions/snapshots'

it('combines identical profile plans while rejecting conflicting values, revisions, and file owners before publication', () => {
  const plan = {
    file: '/project/case.ts',
    sourceHash: 'revision',
    updates: [
      { path: '/project/case.txt', previousContent: null, content: 'value' },
    ],
  }
  expect(combineSnapshotUpdatePlans([plan, structuredClone(plan)])).toEqual([
    plan,
  ])
  expect(combineSnapshotUpdatePlans([{ ...plan, updates: [] }, plan])).toEqual([
    plan,
  ])
  expect(() =>
    combineSnapshotUpdatePlans([
      plan,
      { ...plan, updates: [{ ...plan.updates[0], content: 'different' }] },
    ])
  ).toThrow('Conflicting snapshot update plans')
  expect(() =>
    combineSnapshotUpdatePlans([plan, { ...plan, sourceHash: 'other' }])
  ).toThrow('Conflicting source revisions')
  expect(() =>
    combineSnapshotUpdatePlans([plan, { ...plan, file: '/project/other.ts' }])
  ).toThrow('Different test files')
})

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

it('restores already published bytes when a later snapshot replacement fails', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'next-snapshot-rollback-'))
  const testPath = join(directory, 'parent.test.ts')
  const external = join(directory, '__snapshots__/parent.test.ts.snap')
  const raw = join(directory, 'raw.txt')
  await mkdir(join(directory, '__snapshots__'))
  await writeFile(external, 'original')
  const fs = require('node:fs/promises')
  const rename = fs.rename
  jest.spyOn(fs, 'rename').mockImplementation(async (...args: unknown[]) => {
    if (args[1] === raw) throw new Error('replacement failed')
    return Reflect.apply(rename, fs, args)
  })
  try {
    await expect(
      commitSnapshotUpdates(testPath, [
        { path: external, previousContent: 'original', content: 'updated' },
        { path: raw, previousContent: null, content: 'new raw' },
      ])
    ).rejects.toThrow('replacement failed')
    expect(await readFile(external, 'utf8')).toBe('original')
    await expect(readFile(raw)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readdir(join(directory, '__snapshots__'))).toEqual([
      'parent.test.ts.snap',
    ])
    expect(await readdir(directory)).toEqual(['__snapshots__'])
  } finally {
    jest.restoreAllMocks()
    await rm(directory, { recursive: true, force: true })
  }
})

it('preserves a concurrent user edit and retains recoverable bytes if rollback is refused', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'next-snapshot-edited-'))
  const testPath = join(directory, 'parent.test.ts')
  const external = join(directory, '__snapshots__/parent.test.ts.snap')
  const raw = join(directory, 'raw.txt')
  await mkdir(join(directory, '__snapshots__'))
  await writeFile(external, 'original')
  const fs = require('node:fs/promises')
  const rename = fs.rename
  jest.spyOn(fs, 'rename').mockImplementation(async (...args: unknown[]) => {
    if (args[1] === raw) {
      await writeFile(external, 'user edit')
      throw new Error('replacement failed')
    }
    return Reflect.apply(rename, fs, args)
  })
  try {
    await expect(
      commitSnapshotUpdates(testPath, [
        { path: external, previousContent: 'original', content: 'updated' },
        { path: raw, previousContent: null, content: 'new raw' },
      ])
    ).rejects.toThrow('recovery backups were retained')
    expect(await readFile(external, 'utf8')).toBe('user edit')
    const backup = (await readdir(join(directory, '__snapshots__'))).find(
      (name) => name.endsWith('.backup')
    )!
    expect(
      await readFile(join(directory, '__snapshots__', backup), 'utf8')
    ).toBe('original')
    await expect(readFile(raw)).rejects.toMatchObject({ code: 'ENOENT' })
    jest.restoreAllMocks()
    await expect(recoverSnapshotUpdates(directory)).rejects.toThrow(
      'requires resolving a concurrent edit'
    )
    expect(await readFile(external, 'utf8')).toBe('user edit')
    // Resolving the conflict to the original revision makes recovery idempotent
    // and releases all retained transaction files without another update request.
    await writeFile(external, 'original')
    await recoverSnapshotUpdates(directory)
    expect(await readdir(join(directory, '__snapshots__'))).toEqual([
      'parent.test.ts.snap',
    ])
    await expect(
      stat(join(directory, '.next-test-snapshot-journals'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
  } finally {
    jest.restoreAllMocks()
    await rm(directory, { recursive: true, force: true })
  }
})

it('rolls back cancellation observed during the final snapshot rename', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'next-snapshot-final-cancel-'))
  const testPath = join(directory, 'case.ts')
  const external = join(directory, '__snapshots__', 'case.ts.snap')
  const raw = join(directory, 'raw.txt')
  const controller = new AbortController()
  const reason = new Error('cancelled during final rename')
  await mkdir(join(directory, '__snapshots__'))
  await writeFile(external, 'external original')
  await writeFile(raw, 'raw original')
  const fs = require('node:fs/promises')
  const rename = fs.rename
  jest.spyOn(fs, 'rename').mockImplementation(async (...args: unknown[]) => {
    const result = await Reflect.apply(rename, fs, args)
    if (args[1] === raw) controller.abort(reason)
    return result
  })
  try {
    await expect(
      commitSnapshotUpdates(
        testPath,
        [
          {
            path: external,
            previousContent: 'external original',
            content: 'external updated',
          },
          {
            path: raw,
            previousContent: 'raw original',
            content: 'raw updated',
          },
        ],
        { signal: controller.signal }
      )
    ).rejects.toBe(reason)
    expect(await readFile(external, 'utf8')).toBe('external original')
    expect(await readFile(raw, 'utf8')).toBe('raw original')
    expect((await readdir(directory)).sort()).toEqual([
      '__snapshots__',
      'raw.txt',
    ])
  } finally {
    jest.restoreAllMocks()
    await rm(directory, { recursive: true, force: true })
  }
})

it('refuses recovery records that address a file outside the invocation root', async () => {
  const directory = await mkdtemp(
    join(tmpdir(), 'next-snapshot-invalid-journal-')
  )
  const outside = await mkdtemp(join(tmpdir(), 'next-snapshot-user-source-'))
  const source = join(outside, 'source.ts')
  const journal = join(directory, '.next-test-snapshot-journals')
  try {
    await writeFile(source, 'user source')
    await mkdir(journal)
    await writeFile(
      join(journal, '00000000-0000-4000-8000-000000000000.json'),
      JSON.stringify({
        version: 1,
        testPath: source,
        updates: [
          { path: source, previousContent: 'old', content: 'user source' },
        ],
      })
    )
    await expect(recoverSnapshotUpdates(directory)).rejects.toThrow(
      'Invalid snapshot recovery journal'
    )
    expect(await readFile(source, 'utf8')).toBe('user source')
  } finally {
    await rm(directory, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
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

it.each(['development', 'production'] as const)(
  'commits completed failed Node body snapshots after a clean %s worker exit and holds exit failures',
  async (mode) => {
    const directory = await mkdtemp(
      join(tmpdir(), 'next-failed-snapshot-parent-')
    )
    const path = join(directory, 'body.test.ts.snap')
    const profile = {
      id: 'node',
      mode,
      environment: 'node' as const,
      runtime: 'nodejs' as const,
      bundler: 'turbopack' as const,
    }
    const entry = {
      id: 'node:failed-body',
      file: join(directory, 'body.test.ts'),
      profile,
    }
    const artifact: CompiledTestArtifact = {
      version: 2,
      kind: 'node',
      entryId: entry.id,
      profile,
      revision: 'failed-body-revision',
      rootDir: directory,
      entryPath: 'body.js',
      files: [],
      diagnostics: [],
    }
    try {
      for (const code of [1, 0]) {
        await writeFile(path, 'original')
        runWorker.mockReset()
        let cacheDirectory: string | undefined
        runWorker.mockImplementation(async (_worker, workerOptions) => {
          cacheDirectory = (workerOptions.input as WorkerInput).cacheScope
            .directory
          expect(await readFile(path, 'utf8')).toBe('original')
          workerOptions.onMessage({
            type: 'complete',
            result: {
              entryId: artifact.entryId,
              status: 'failed',
              durationMs: 1,
            },
            snapshotUpdates: [
              { path, previousContent: 'original', content: 'updated' },
            ],
          })
          return { reason: 'exit', code, signal: null }
        })
        const result = await executeWithEnvironment(
          artifact,
          {
            runId: 'failed-body-snapshots',
            projectDir: directory,
            entry,
            setupFiles: [],
            updateSnapshots: true,
            testTimeout: 1000,
            hookTimeout: 1000,
            fileTimeout: 5000,
            signal: new AbortController().signal,
            onEvent() {},
          },
          process.env
        )
        expect(result.status).toBe('failed')
        expect(await readFile(path, 'utf8')).toBe(
          code === 0 ? 'updated' : 'original'
        )
        await expect(stat(cacheDirectory!)).rejects.toMatchObject({
          code: 'ENOENT',
        })
      }
    } finally {
      runWorker.mockReset()
      await rm(directory, { recursive: true, force: true })
    }
  }
)
