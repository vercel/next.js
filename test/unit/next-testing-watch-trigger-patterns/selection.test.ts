import { mkdtemp, rm, mkdir, writeFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  classifyWatchTriggerSources,
  resolveWatchTriggerSelection,
} from 'next/dist/experimental/testing/incremental/watch-trigger-selection'
import { createWatchSession } from 'next/dist/experimental/testing/incremental/watch-session'

const files = [
  { id: 'alpha:alpha.test.mjs', file: '/project/alpha.test.mjs' },
  { id: 'also-alpha:alpha.test.mjs', file: '/project/alpha.test.mjs' },
  { id: 'beta:beta.test.mjs', file: '/project/beta.test.mjs' },
]

it('selects actual matching specifications across projects and leaves only unmatched paths for native fallback', () => {
  expect(
    resolveWatchTriggerSelection(
      files,
      ['/project/payload.mjs', '/project/shared.mjs'],
      [
        {
          source: '/project/payload.mjs',
          matched: true,
          tests: ['/project/alpha.test.mjs'],
        },
        { source: '/project/shared.mjs', matched: false },
      ]
    )
  ).toEqual({
    entryIds: ['alpha:alpha.test.mjs', 'also-alpha:alpha.test.mjs'],
    fallbackPaths: ['/project/shared.mjs'],
    requestedFiles: ['/project/alpha.test.mjs'],
  })
})

it('preserves a later unmapped observation of the same path for native fallback', () => {
  expect(
    resolveWatchTriggerSelection(
      files,
      ['/project/payload.mjs'],
      [
        {
          source: '/project/payload.mjs',
          matched: true,
          tests: ['/project/alpha.test.mjs'],
        },
        { source: '/project/payload.mjs', matched: false },
      ]
    ).fallbackPaths
  ).toEqual(['/project/payload.mjs'])
})

it('preserves an actual nonempty request independently of whether current specifications exist', () => {
  expect(
    resolveWatchTriggerSelection(
      files,
      ['/project/payload.mjs'],
      [{ source: '/project/payload.mjs', matched: true, tests: ['/project'] }]
    )
  ).toEqual({ entryIds: [], fallbackPaths: [], requestedFiles: ['/project'] })
  expect(
    resolveWatchTriggerSelection(
      files,
      ['/project/payload.mjs'],
      [{ source: '/project/payload.mjs', matched: true, tests: [] }]
    )
  ).toEqual({ entryIds: [], fallbackPaths: [], requestedFiles: [] })
})

it('classifies real regular files while leaving directory, deleted and symlink scopes for existing fallback', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'next-trigger-sources-'))
  try {
    const regular = path.join(directory, 'payload.mjs')
    const child = path.join(directory, 'directory')
    const link = path.join(directory, 'link.mjs')
    await writeFile(regular, 'export const value=1\n')
    await mkdir(child)
    await symlink(regular, link)
    expect(
      await classifyWatchTriggerSources(
        [regular, child, link, path.join(directory, 'deleted.mjs')],
        new AbortController().signal
      )
    ).toEqual([regular])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('joins all started reads before retaining the original I/O failure', async () => {
  const fs = require('node:fs/promises') as typeof import('node:fs/promises')
  let release!: (value: unknown) => void
  const held = new Promise((resolve) => {
    release = resolve
  })
  const failure = Object.assign(new Error('actual inaccessible input'), {
    code: 'EACCES',
  })
  const read = jest.spyOn(fs, 'lstat').mockImplementation(async (file) => {
    if (file === '/held')
      return (await held) as Awaited<ReturnType<typeof fs.lstat>>
    throw failure
  })
  let settled = false
  const work = classifyWatchTriggerSources(
    ['/held', '/inaccessible'],
    new AbortController().signal
  ).catch((error) => {
    settled = true
    return error
  })
  try {
    await Promise.resolve()
    await Promise.resolve()
    expect(settled).toBe(false)
    release({ isFile: () => true })
    expect(await work).toBe(failure)
  } finally {
    release({ isFile: () => true })
    await work
    read.mockRestore()
  }
})

it('joins a started read before releasing an aborted observation', async () => {
  const fs = require('node:fs/promises') as typeof import('node:fs/promises')
  let release!: (value: unknown) => void
  const held = new Promise((resolve) => {
    release = resolve
  })
  const read = jest
    .spyOn(fs, 'lstat')
    .mockImplementation(
      async () => (await held) as Awaited<ReturnType<typeof fs.lstat>>
    )
  const controller = new AbortController()
  const reason = new Error('actual observation cancelled')
  let settled = false
  const work = classifyWatchTriggerSources(['/held'], controller.signal).catch(
    (error) => {
      settled = true
      return error
    }
  )
  try {
    controller.abort(reason)
    await Promise.resolve()
    expect(settled).toBe(false)
    release({ isFile: () => true })
    expect(await work).toBe(reason)
  } finally {
    release({ isFile: () => true })
    await work
    read.mockRestore()
  }
})

it.each([false, true])(
  'distinguishes suppressed [] from a requested zero-spec run: runEmpty=%s',
  async (runEmpty) => {
    let initial!: () => void
    let updated!: () => void
    const first = new Promise<void>((resolve) => {
      initial = resolve
    })
    const next = new Promise<void>((resolve) => {
      updated = resolve
    })
    const calls: number[] = []
    let settled = 0
    const session = createWatchSession({
      discover: async () => ({
        entryIds: ['alpha', 'beta'],
        discoveryRevision: 'actual-discovery',
      }),
      selectTests: async ({ changedPaths }) =>
        changedPaths
          ? {
              entryIds: [],
              reason: 'watch-trigger-patterns' as const,
              ...(runEmpty ? { runEmpty: true as const } : {}),
            }
          : undefined,
      run: async ({ selection }) => {
        calls.push(selection.entryIds.length)
        return {
          status: selection.entryIds.length
            ? ('passed' as const)
            : ('failed' as const),
        }
      },
      onRunSettled() {
        if (++settled === 1) initial()
        else updated()
      },
      onError(error) {
        throw error
      },
    })
    try {
      await first
      session.invalidate({ registryPaths: ['/project/payload.mjs'] })
      await next
      await session.waitForIdle()
      expect(calls).toEqual(runEmpty ? [2, 0] : [2])
    } finally {
      await session.close()
    }
  }
)
