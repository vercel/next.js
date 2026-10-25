import {
  createWatchSession,
  SupersededTestRun,
  type WatchDiscovery,
  type WatchRun,
} from 'next/dist/experimental/testing/incremental/watch-session'
import {
  watchTestFiles,
  type FileChange,
} from 'next/dist/experimental/testing/incremental/watch-files'
import {
  selectRegistryAdditions,
  selectRegistryRemovals,
  snapshotWatchRegistry,
  type WatchRegistrySnapshot,
} from 'next/dist/experimental/testing/incremental/registry-additions'
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { retry } from 'next-test-utils'
import fs from 'fs'
import { EventEmitter } from 'events'
import { execFile } from 'child_process'
import { promisify } from 'util'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function harness() {
  let discovery: WatchDiscovery = {
    entryIds: ['node', 'rsc'],
    discoveryRevision: 'config-1',
  }
  const runs: WatchRun<WatchDiscovery>[] = []
  const errors: unknown[] = []
  const discover = jest.fn(async () => discovery)
  const run = jest.fn(async (input: WatchRun<WatchDiscovery>) => {
    runs.push(input)
    return { status: 'passed' as 'passed' | 'failed' | 'cancelled' }
  })
  const session = createWatchSession({
    discover,
    run,
    onError: (error) => errors.push(error),
  })
  return {
    session,
    runs,
    run,
    discover,
    errors,
    setDiscovery(value: WatchDiscovery) {
      discovery = value
    },
  }
}

const complete = (entryIds: string[]) => ({
  changes: [
    {
      revision: 'compiler-revision',
      discoveryRevision: 'config-1',
      affectedEntryIds: entryIds,
      complete: true,
    },
  ],
})

describe('serialized test watch session', () => {
  it('runs initially and coalesces edits with a fresh signal/generation', async () => {
    const h = harness()
    await h.session.waitForIdle()
    h.session.invalidate()
    h.session.invalidate()
    h.session.invalidate()
    await h.session.waitForIdle()
    expect(h.runs.map((r) => r.selection.entryIds)).toEqual([
      ['node', 'rsc'],
      ['node', 'rsc'],
    ])
    expect(h.runs.map((r) => r.generation)).toEqual([1, 2])
    expect(h.runs[0].signal).not.toBe(h.runs[1].signal)
    await h.session.close()
  })

  it('unions complete evidence, but missing or incomplete evidence widens', async () => {
    const h = harness()
    await h.session.waitForIdle()
    h.session.invalidate(complete(['rsc']))
    await h.session.waitForIdle()
    expect(h.runs[1].selection.entryIds).toEqual(['rsc'])
    h.session.invalidate(complete(['node']))
    h.session.invalidate(complete(['rsc']))
    await h.session.waitForIdle()
    expect(h.runs[2].selection.entryIds).toEqual(['node', 'rsc'])
    h.session.invalidate(complete(['rsc']))
    h.session.invalidate()
    await h.session.waitForIdle()
    expect(h.runs[3].selection.reason).toBe('missing-dependencies')
    const incomplete = complete([])
    incomplete.changes[0].complete = false
    h.session.invalidate(incomplete)
    await h.session.waitForIdle()
    expect(h.runs[4].selection.reason).toBe('incomplete-dependencies')
    await h.session.close()
  })

  it('rediscovers test addition/deletion, including empty discovery', async () => {
    const h = harness()
    await h.session.waitForIdle()
    h.setDiscovery({ entryIds: [], discoveryRevision: 'empty' })
    h.session.invalidate()
    await h.session.waitForIdle()
    expect(h.run).toHaveBeenCalledTimes(1)
    h.setDiscovery({ entryIds: ['new'], discoveryRevision: 'new-test' })
    h.session.invalidate()
    await h.session.waitForIdle()
    expect(h.runs[1].selection.entryIds).toEqual(['new'])
    await h.session.close()
  })

  it('widens for changed config or setup generation despite complete evidence', async () => {
    const h = harness()
    await h.session.waitForIdle()
    h.setDiscovery({
      entryIds: ['node', 'rsc'],
      discoveryRevision: 'config-2',
    })
    const evidence = complete(['node'])
    evidence.changes[0].discoveryRevision = 'config-2'
    h.session.invalidate(evidence)
    await h.session.waitForIdle()
    expect(h.runs[1].selection).toEqual({
      entryIds: ['node', 'rsc'],
      reason: 'global-invalidation',
    })
    await h.session.close()
  })

  it('awaits superseded run cleanup and retains all edits during execution', async () => {
    const h = harness()
    const started = deferred()
    const cleanup = deferred()
    const order: string[] = []
    h.run.mockImplementationOnce(async (input) => {
      h.runs.push(input)
      started.resolve()
      await cleanup.promise
      order.push('closed')
      return { status: 'cancelled' }
    })
    await started.promise
    h.session.invalidate(complete(['node']))
    h.session.invalidate(complete(['rsc']))
    expect(h.runs[0].signal.reason).toBeInstanceOf(SupersededTestRun)
    expect(h.run).toHaveBeenCalledTimes(1)
    h.run.mockImplementationOnce(async (input) => {
      h.runs.push(input)
      order.push('next')
      return { status: 'passed' }
    })
    cleanup.resolve()
    await h.session.waitForIdle()
    expect(order).toEqual(['closed', 'next'])
    expect(h.runs[1].selection.entryIds).toEqual(['node', 'rsc'])
    expect(h.errors).toEqual([])
    await h.session.close()
  })

  it('retains changes arriving while discovery is in flight', async () => {
    const h = harness()
    const started = deferred()
    const release = deferred()
    h.discover.mockImplementationOnce(async () => {
      started.resolve()
      await release.promise
      return { entryIds: ['deleted'], discoveryRevision: 'old' }
    })
    await started.promise
    h.session.invalidate()
    release.resolve()
    await h.session.waitForIdle()
    expect(h.runs.map((r) => r.selection.entryIds)).toEqual([['node', 'rsc']])
    expect(h.discover).toHaveBeenCalledTimes(2)
    await h.session.close()
  })

  it('recovers on the next edit after invalid configuration or compilation', async () => {
    const h = harness()
    const error = new Error('Invalid config')
    h.discover.mockRejectedValueOnce(error)
    await h.session.waitForIdle()
    expect(h.errors).toEqual([error])
    h.run.mockResolvedValueOnce({ status: 'failed' })
    h.session.invalidate(complete(['node']))
    await h.session.waitForIdle()
    h.session.invalidate(complete(['rsc']))
    await h.session.waitForIdle()
    expect(h.run.mock.calls.map(([r]) => r.selection.entryIds)).toEqual([
      ['node', 'rsc'],
      ['node', 'rsc'],
    ])
    await h.session.close()
  })

  it('close cancels in-flight work, awaits closure and discards pending reruns', async () => {
    const h = harness()
    const started = deferred()
    const cleanup = deferred()
    h.run.mockImplementationOnce(async (input) => {
      h.runs.push(input)
      started.resolve()
      await cleanup.promise
      return { status: 'cancelled' }
    })
    await started.promise
    h.session.invalidate()
    let closed = false
    const closing = h.session.close().then(() => {
      closed = true
    })
    expect(h.runs[0].signal.aborted).toBe(true)
    expect(closed).toBe(false)
    cleanup.resolve()
    await closing
    await h.session.closed
    h.session.invalidate()
    await h.session.waitForIdle()
    expect(h.run).toHaveBeenCalledTimes(1)
    await h.session.close()
  })

  it('never reacquires output ownership after unsafe cleanup', async () => {
    const h = harness()
    h.run.mockImplementationOnce(async () => {
      h.session.invalidate()
      return { status: 'failed', unsafeCleanup: true }
    })
    await h.session.closed
    await h.session.waitForIdle()
    h.session.invalidate()
    await h.session.waitForIdle()
    expect(h.run).toHaveBeenCalledTimes(1)
  })

  it('handles pre-aborted signals and surfaces a failing error reporter', async () => {
    const controller = new AbortController()
    controller.abort()
    const discover = jest.fn()
    const stopped = createWatchSession({
      signal: controller.signal,
      discover,
      run: jest.fn(),
      onError: jest.fn(),
    })
    await stopped.closed
    await stopped.close()
    expect(discover).not.toHaveBeenCalled()
    const error = new Error('Reporter failed')
    const fatal = createWatchSession({
      discover: async () => {
        throw new Error('Config invalid')
      },
      run: jest.fn(),
      onError: () => {
        throw error
      },
    })
    await fatal.closed
    await expect(fatal.waitForIdle()).rejects.toBe(error)
    await expect(fatal.close()).rejects.toBe(error)
  })
})

describe('test input filesystem watcher', () => {
  it('rejects startup failure after closing an already acquired subscription', async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), 'next-testing-watch-failure-')
    )
    const first = path.join(root, 'first')
    const second = path.join(root, 'second')
    await mkdir(first)
    await mkdir(second)
    let closed = false
    class Subscription extends EventEmitter {
      close() {
        queueMicrotask(() => {
          closed = true
          this.emit('close')
        })
      }
      ref() {
        return this
      }
      unref() {
        return this
      }
    }
    const error = new Error('ENOSPC: subscription limit')
    const nativeWatch = jest
      .spyOn(fs, 'watch')
      .mockReturnValueOnce(new Subscription())
      .mockImplementationOnce(() => {
        throw error
      })
    try {
      await expect(
        watchTestFiles({
          directories: [first, second],
          outputDirectories: [],
          onChange: jest.fn(),
          onError: jest.fn(),
        })
      ).rejects.toBe(error)
      expect(closed).toBe(true)
    } finally {
      nativeWatch.mockRestore()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('surfaces asynchronous subscription failure and stops all native watchers', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'next-testing-watch-error-'))
    const first = path.join(root, 'first')
    const second = path.join(root, 'second')
    await mkdir(first)
    await mkdir(second)
    const errors: unknown[] = []
    const nativeWatch = jest.spyOn(fs, 'watch')
    const source = await watchTestFiles({
      directories: [first, second],
      outputDirectories: [],
      onChange: jest.fn(),
      onError: (error) => errors.push(error),
    })
    try {
      const watchers = nativeWatch.mock.results.map(
        (result) => result.value as fs.FSWatcher
      )
      const closed = watchers.map(
        (watcher) =>
          new Promise<void>((resolve) => watcher.once('close', resolve))
      )
      const error = new Error('EIO: subscription failed')
      watchers[0].emit('error', error)
      expect(errors).toEqual([error])
      await source.close()
      await Promise.all(closed)
      await source.update({ directories: [root], outputDirectories: [] })
      expect(nativeWatch).toHaveBeenCalledTimes(4)
    } finally {
      await source.close()
      nativeWatch.mockRestore()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('watches exact compiler package dependencies while ignoring unrelated installed files', async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), 'next-testing-watch-config-deps-')
    )
    class Subscription extends EventEmitter {
      close() {
        queueMicrotask(() => this.emit('close'))
      }
      ref() {
        return this
      }
      unref() {
        return this
      }
    }
    const nativeWatch = jest
      .spyOn(fs, 'watch')
      .mockReturnValueOnce(new Subscription())
      .mockReturnValueOnce(new Subscription())
    const dependency = path.join(
      root,
      'node_modules/transform/internal/helper.js'
    )
    const events: FileChange[] = []
    const changed = deferred()
    const source = await watchTestFiles({
      directories: [root],
      outputDirectories: [],
      dependencyFiles: [dependency],
      onChange: (event) => {
        events.push(event)
        changed.resolve()
      },
      onError: (error) => {
        throw error
      },
    })
    try {
      const listener: unknown = Reflect.get(nativeWatch.mock.calls[0], 2)
      if (typeof listener !== 'function')
        throw new Error('Expected native root watch callback')
      listener('change', 'node_modules/transform/unrelated.js')
      listener('change', 'node_modules/transform/internal/helper.js')
      await changed.promise
      expect(events).toEqual([{ changed: [dependency], removed: [] }])
    } finally {
      await source.close()
      nativeWatch.mockRestore()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('invalidates conservatively when a native event omits its filename', async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), 'next-testing-watch-unknown-')
    )
    class Subscription extends EventEmitter {
      close() {
        queueMicrotask(() => this.emit('close'))
      }
      ref() {
        return this
      }
      unref() {
        return this
      }
    }
    // Inject just the event under test: live watchers may also report the
    // directory's creation/self-event during the same notification batch.
    const nativeWatch = jest
      .spyOn(fs, 'watch')
      .mockReturnValueOnce(new Subscription())
      .mockReturnValueOnce(new Subscription())
    const changed = deferred()
    const events: FileChange[] = []
    const source = await watchTestFiles({
      directories: [root],
      outputDirectories: [],
      onChange: (event) => {
        events.push(event)
        changed.resolve()
      },
      onError: (error) => {
        throw error
      },
    })
    try {
      // fs.watch is called with its three-argument overload; Jest's type
      // describes the last two-argument overload, so validate its callback.
      const listener: unknown = Reflect.get(nativeWatch.mock.calls[0], 2)
      if (typeof listener !== 'function') {
        throw new Error('Expected the native root watch callback')
      }
      listener('change', null)
      await changed.promise
      expect(events).toEqual([{ changed: [root], removed: [] }])
    } finally {
      await source.close()
      nativeWatch.mockRestore()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('stops if the watched root is replaced rather than following its old inode', async () => {
    const parent = await mkdtemp(
      path.join(tmpdir(), 'next-testing-watch-inode-')
    )
    const root = path.join(parent, 'project')
    await mkdir(root)
    const errors: unknown[] = []
    const source = await watchTestFiles({
      directories: [root],
      outputDirectories: [],
      onChange: jest.fn(),
      onError: (error) => errors.push(error),
    })
    try {
      await fs.promises.rename(root, path.join(parent, 'old-project'))
      await mkdir(root)
      await retry(async () => {
        expect(errors).toHaveLength(1)
      })
      await source.close()
    } finally {
      await source.close()
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('stops if the watched root parent is moved and recreated', async () => {
    const outer = await mkdtemp(
      path.join(tmpdir(), 'next-testing-watch-parent-')
    )
    const parent = path.join(outer, 'workspace')
    const root = path.join(parent, 'project')
    await mkdir(root, { recursive: true })
    const errors: unknown[] = []
    const source = await watchTestFiles({
      directories: [root],
      outputDirectories: [],
      onChange: jest.fn(),
      onError: (error) => errors.push(error),
    })
    try {
      await fs.promises.rename(parent, path.join(outer, 'old-workspace'))
      await mkdir(root, { recursive: true })
      await writeFile(path.join(root, 'new.test.ts'), 'replacement')
      await retry(async () => {
        expect(errors).toHaveLength(1)
      })
      await source.close()
    } finally {
      await source.close()
      await rm(outer, { recursive: true, force: true })
    }
  })

  it.each(['parent event', 'integrity check'] as const)(
    'detects parent replacement using %s without a root event',
    async (trigger) => {
      const outer = await mkdtemp(
        path.join(tmpdir(), 'next-testing-watch-parent-event-')
      )
      const parent = path.join(outer, 'workspace')
      const root = path.join(parent, 'project')
      await mkdir(root, { recursive: true })
      class Subscription extends EventEmitter {
        close() {
          queueMicrotask(() => this.emit('close'))
        }
        ref() {
          return this
        }
        unref() {
          return this
        }
      }
      const nativeWatch = jest
        .spyOn(fs, 'watch')
        .mockReturnValueOnce(new Subscription())
        .mockReturnValueOnce(new Subscription())
      const errors: unknown[] = []
      const source = await watchTestFiles({
        directories: [root],
        outputDirectories: [],
        onChange: jest.fn(),
        onError: (error) => errors.push(error),
      })
      try {
        await fs.promises.rename(parent, path.join(outer, 'old-workspace'))
        await mkdir(root, { recursive: true })
        // Valid native self-rename notification for the watched parent. No
        // root-named notification is supplied by this controlled event sequence.
        // Jest models fs.watch's final two-argument overload; this call uses its
        // three-argument overload. Inspect and validate the recorded callback.
        if (trigger === 'parent event') {
          const guardListener: unknown = Reflect.get(
            nativeWatch.mock.calls[1],
            2
          )
          if (typeof guardListener !== 'function') {
            throw new Error('Expected the native parent watch callback')
          }
          guardListener('rename', path.basename(parent))
        } else {
          // No native event is delivered at all; the bounded integrity check
          // must independently detect that both subscriptions retain old inodes.
          await retry(async () => {
            expect(errors).toHaveLength(1)
          })
        }
        expect(errors).toHaveLength(1)
        await source.close()
      } finally {
        await source.close()
        nativeWatch.mockRestore()
        await rm(outer, { recursive: true, force: true })
      }
    }
  )

  it('reports unexpected subscription closure instead of remaining live', async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), 'next-testing-watch-stopped-')
    )
    const nativeWatch = jest.spyOn(fs, 'watch')
    const errors: unknown[] = []
    const source = await watchTestFiles({
      directories: [root],
      outputDirectories: [],
      onChange: jest.fn(),
      onError: (error) => errors.push(error),
    })
    try {
      const watcher = nativeWatch.mock.results[0].value as fs.FSWatcher
      const stopped = new Promise<void>((resolve) =>
        watcher.once('close', resolve)
      )
      watcher.close()
      await stopped
      expect(errors).toHaveLength(1)
      expect(String(errors[0])).toContain('closed unexpectedly')
      await source.close()
    } finally {
      await source.close()
      nativeWatch.mockRestore()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('releases watcher resources so an actual child exits naturally', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'next-testing-watch-close-'))
    try {
      const script = `
        const { watchTestFiles } = require(process.argv[1]);
        const fs = require('fs/promises');
        const path = require('path');
        const root = process.argv[2];
        (async () => {
        const watcher = await watchTestFiles({
          directories: [root],
          outputDirectories: [],
          onChange() { void watcher.close().then(() => console.log('closed')); },
          onError(error) { watcher.close(); throw error; }
        });
        fs.writeFile(path.join(root, 'new.test.ts'), 'changed').catch(error => {
          void watcher.close().then(() => { throw error; });
        });
        })().catch(error => { throw error; });
      `
      const result = await promisify(execFile)(
        process.execPath,
        [
          '-e',
          script,
          require.resolve(
            'next/dist/experimental/testing/incremental/watch-files'
          ),
          root,
        ],
        { timeout: 10000 }
      )
      expect(result.stdout.trim()).toBe('closed')
      expect(result.stderr).toBe('')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('observes source/config/setup/add/delete changes and excludes actual outputs', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'next-testing-watch-'))
    const output = path.join(root, 'custom-output')
    const snapshot = path.join(root, '.next-test-fixture')
    await mkdir(output)
    await mkdir(snapshot)
    const changes: FileChange[] = []
    const errors: unknown[] = []
    const watcher = await watchTestFiles({
      directories: [root],
      outputDirectories: [output],
      artifactDirectories: [
        { parentDirectory: root, basenamePrefixes: ['.next-test-'] },
      ],
      onChange: (change) => changes.push(change),
      onError: (error) => errors.push(error),
    })
    try {
      for (const name of ['source.ts', '.env', 'setup.ts', 'added.test.ts']) {
        const file = path.join(root, name)
        await writeFile(file, 'first')
        await retry(async () => {
          expect(errors).toEqual([])
          expect(changes.flatMap((event) => event.changed)).toContain(file)
        })
        changes.length = 0
        await writeFile(file, 'second mutation')
        await retry(async () => {
          expect(errors).toEqual([])
          expect(changes.flatMap((event) => event.changed)).toContain(file)
        })
        changes.length = 0
      }
      const removed = path.join(root, 'added.test.ts')
      await rm(removed)
      await retry(async () => {
        expect(
          changes.some(
            (event) =>
              event.changed.includes(removed) || event.removed.includes(removed)
          )
        ).toBe(true)
      })
      changes.length = 0
      await writeFile(path.join(output, 'emitted.js'), 'output')
      await writeFile(path.join(snapshot, 'entry.js'), 'snapshot')
      const lateSnapshot = path.join(root, '.next-test-pending-late')
      await mkdir(lateSnapshot)
      await writeFile(path.join(lateSnapshot, 'entry.js'), 'pending snapshot')
      const nextOutput = path.join(root, 'changed-output')
      await watcher.update({
        directories: [root],
        outputDirectories: [output, nextOutput],
        artifactDirectories: [
          { parentDirectory: root, basenamePrefixes: ['.next-test-'] },
        ],
      })
      await mkdir(nextOutput)
      await writeFile(path.join(nextOutput, 'emitted.js'), 'new output')
      const barrier = path.join(root, 'last-source.ts')
      await writeFile(barrier, 'source')
      await retry(async () => {
        expect(changes.some((event) => event.changed.includes(barrier))).toBe(
          true
        )
      })
      expect(
        changes
          .flatMap((event) => event.changed)
          .filter((file) =>
            [output, nextOutput, snapshot, lateSnapshot].some((directory) =>
              file.startsWith(directory)
            )
          )
      ).toEqual([])
      expect(errors).toEqual([])
      await watcher.close()
      await watcher.close()
      const count = changes.length
      await writeFile(path.join(root, 'after-close.ts'), 'closed')
      expect(changes).toHaveLength(count)
    } finally {
      await watcher.close()
      await rm(root, { recursive: true, force: true })
    }
  })
})

it('excludes exact machine-report outputs and owned temporary files while observing neighboring source files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'next-watch-report-outputs-'))
  const report = path.join(root, 'result.json')
  const temporary = `${report}.12345678-1234-1234-1234-123456789abc.tmp`
  const neighbor = `${report}.source.ts`
  const changes: FileChange[] = []
  const watcher = await watchTestFiles({
    directories: [root],
    outputDirectories: [],
    outputFiles: [report],
    onChange: (change) => changes.push(change),
    onError: (error) => {
      throw error
    },
  })
  try {
    await writeFile(report, '{}')
    await writeFile(temporary, '{}')
    await writeFile(neighbor, 'export const value=1')
    await retry(async () => {
      expect(changes.flatMap((change) => change.changed)).toContain(neighbor)
    })
    expect(changes.flatMap((change) => change.changed)).not.toContain(report)
    expect(changes.flatMap((change) => change.changed)).not.toContain(temporary)
  } finally {
    await watcher.close()
    await rm(root, { recursive: true, force: true })
  }
})

describe('matching-new-test registry policy', () => {
  const projectRoot = path.join(tmpdir(), 'next-test-registry-policy')
  const baseline: WatchRegistrySnapshot = {
    configurationRevision: 'effective-config-profile-and-selection',
    entries: [
      {
        id: 'node',
        file: path.join(projectRoot, 'node.test.ts'),
        sourceHash: 'node-bytes',
      },
      {
        id: 'rsc',
        file: path.join(projectRoot, 'rsc.test.ts'),
        sourceHash: 'rsc-bytes',
      },
    ],
    inputs: [
      { file: path.join(projectRoot, 'setup.ts'), sourceHash: 'setup-bytes' },
      {
        file: path.join(projectRoot, 'next.test.config.json'),
        sourceHash: 'config-bytes',
      },
    ],
  }
  const newEntry = {
    id: 'new',
    file: path.join(projectRoot, 'new.test.ts'),
    sourceHash: 'new-bytes',
  }
  function appended() {
    return {
      ...structuredClone(baseline),
      entries: [...structuredClone(baseline.entries), { ...newEntry }],
    }
  }
  function start() {
    const h = harness()
    h.setDiscovery({
      entryIds: baseline.entries.map((entry) => entry.id),
      discoveryRevision: 'old-registry',
      registry: structuredClone(baseline),
    })
    return h
  }
  function discovery(registry: WatchRegistrySnapshot | undefined) {
    return {
      entryIds: ['node', 'rsc', 'new'],
      discoveryRevision: 'new-registry',
      registry,
    }
  }

  it('uses a separate registry reason and runs only the new matching file', async () => {
    const h = start()
    try {
      await h.session.waitForIdle()
      h.setDiscovery(discovery(appended()))
      h.session.invalidate({ registryPaths: [newEntry.file] })
      await h.session.waitForIdle()
      expect(h.runs[1].selection).toEqual({
        entryIds: ['new'],
        reason: 'test-registry-addition',
      })
    } finally {
      await h.session.close()
    }
  })

  it('coalesces exact new paths and preserves discovered declaration identities', async () => {
    const h = start()
    try {
      await h.session.waitForIdle()
      const registry = appended()
      registry.entries.push({
        ...newEntry,
        id: 'other',
        file: path.join(projectRoot, 'other.test.ts'),
      })
      h.setDiscovery({
        ...discovery(registry),
        entryIds: ['node', 'rsc', 'new', 'other'],
      })
      h.session.invalidate({ registryPaths: [newEntry.file] })
      h.session.invalidate({
        registryPaths: [path.join(projectRoot, 'other.test.ts'), newEntry.file],
      })
      await h.session.waitForIdle()
      expect(h.runs[1].selection.entryIds).toEqual(['new', 'other'])
      expect(h.runs[1].selection.reason).toBe('test-registry-addition')
    } finally {
      await h.session.close()
    }
  })

  it.each([
    ['unknown parent scope', [projectRoot]],
    [
      'mixed source change',
      [newEntry.file, path.join(projectRoot, 'subject.ts')],
    ],
    [
      'existing test notification',
      [newEntry.file, path.join(projectRoot, 'node.test.ts')],
    ],
    ['relative path', ['new.test.ts']],
    ['empty path evidence', []],
  ])('widens for %s', async (_name, registryPaths: string[]) => {
    const h = start()
    try {
      await h.session.waitForIdle()
      h.setDiscovery(discovery(appended()))
      h.session.invalidate({ registryPaths })
      await h.session.waitForIdle()
      expect(h.runs[1].selection.entryIds).toEqual(['node', 'rsc', 'new'])
      expect(h.runs[1].selection.reason).not.toBe('test-registry-addition')
    } finally {
      await h.session.close()
    }
  })

  it.each([
    [
      'effective configuration',
      (value: WatchRegistrySnapshot) => {
        value.configurationRevision = 'different'
      },
    ],
    [
      'setup source bytes',
      (value: WatchRegistrySnapshot) => {
        value.inputs[0].sourceHash = 'changed'
      },
    ],
    [
      'config source bytes with the same effective value',
      (value: WatchRegistrySnapshot) => {
        value.inputs[1].sourceHash = 'changed'
      },
    ],
    [
      'existing test source bytes',
      (value: WatchRegistrySnapshot) => {
        value.entries[0].sourceHash = 'changed'
      },
    ],
    [
      'deleted entry',
      (value: WatchRegistrySnapshot) => {
        value.entries.splice(0, 1)
      },
    ],
    [
      'different input identities',
      (value: WatchRegistrySnapshot) => {
        value.inputs[0].file = path.join(projectRoot, 'other-setup.ts')
      },
    ],
  ])(
    'widens when %s changed despite a new-file-only notification',
    async (_name, mutate: (value: WatchRegistrySnapshot) => void) => {
      const h = start()
      try {
        await h.session.waitForIdle()
        const registry = appended()
        mutate(registry)
        h.setDiscovery(discovery(registry))
        h.session.invalidate({ registryPaths: [newEntry.file] })
        await h.session.waitForIdle()
        expect(h.runs[1].selection.entryIds).toEqual(['node', 'rsc', 'new'])
        expect(h.runs[1].selection.reason).not.toBe('test-registry-addition')
      } finally {
        await h.session.close()
      }
    }
  )

  it('does not hide missing or incomplete compiler evidence behind a registry event', async () => {
    const h = start()
    try {
      await h.session.waitForIdle()
      h.setDiscovery(discovery(appended()))
      h.session.invalidate({ registryPaths: [newEntry.file] })
      h.session.invalidate()
      await h.session.waitForIdle()
      expect(h.runs[1].selection.entryIds).toEqual(['node', 'rsc', 'new'])
      h.session.invalidate({
        ...complete(['new']),
        registryPaths: [newEntry.file],
        changes: [{ ...complete(['new']).changes[0], complete: false }],
      })
      await h.session.waitForIdle()
      expect(h.runs[2].selection.entryIds).toEqual(['node', 'rsc', 'new'])
      expect(h.runs[2].selection.reason).toBe('incomplete-dependencies')
    } finally {
      await h.session.close()
    }
  })

  it('cannot certify a failed baseline or absent byte evidence', async () => {
    const h = start()
    try {
      h.run.mockImplementationOnce(async (input) => {
        h.runs.push(input)
        return { status: 'failed' }
      })
      await h.session.waitForIdle()
      h.setDiscovery(discovery(appended()))
      h.session.invalidate({ registryPaths: [newEntry.file] })
      await h.session.waitForIdle()
      expect(h.runs[1].selection.entryIds).toEqual(['node', 'rsc', 'new'])
      h.setDiscovery(discovery(undefined))
      h.session.invalidate({ registryPaths: [newEntry.file] })
      await h.session.waitForIdle()
      expect(h.runs[2].selection.reason).not.toBe('test-registry-addition')
    } finally {
      await h.session.close()
    }
  })

  it('hashes the actual existing entry and setup bytes before narrowing', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'next-test-registry-'))
    const existing = path.join(root, 'existing.test.ts')
    const added = path.join(root, 'new.test.ts')
    const setup = path.join(root, 'setup.ts')
    try {
      await Promise.all([
        writeFile(existing, 'existing'),
        writeFile(setup, 'setup'),
      ])
      const options = {
        configurationRevision: 'same',
        entries: [{ id: 'existing', file: existing }],
        inputs: [setup],
      }
      const previous = await snapshotWatchRegistry(options)
      await writeFile(added, 'added')
      const currentOptions = {
        ...options,
        entries: [...options.entries, { id: 'added', file: added }],
      }
      const current = await snapshotWatchRegistry(currentOptions)
      expect(
        selectRegistryAdditions({ previous, current, changedPaths: [added] })
      ).toEqual({ entryIds: ['added'], reason: 'test-registry-addition' })
      await writeFile(setup, 'changed')
      expect(
        selectRegistryAdditions({
          previous,
          current: await snapshotWatchRegistry(currentOptions),
          changedPaths: [added],
        })
      ).toBeUndefined()
      await rm(setup)
      expect(await snapshotWatchRegistry(currentOptions)).toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses symlink inputs and preserves cancellation', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'next-test-registry-link-'))
    try {
      const file = path.join(root, 'entry.test.ts')
      const link = path.join(root, 'link.test.ts')
      await writeFile(file, 'entry')
      await symlink(file, link)
      const options = {
        configurationRevision: 'same',
        entries: [{ id: 'entry', file: link }],
        inputs: [],
      }
      expect(await snapshotWatchRegistry(options)).toBeUndefined()
      const controller = new AbortController()
      const reason = new Error('registry cancelled')
      controller.abort(reason)
      await expect(
        snapshotWatchRegistry({ ...options, signal: controller.signal })
      ).rejects.toBe(reason)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('settled watch readiness', () => {
  const root = path.join(tmpdir(), 'next-watch-settled-registry')
  const original = {
    id: 'old',
    file: path.join(root, 'old.test.ts'),
    sourceHash: 'old',
  }
  const added = {
    id: 'new',
    file: path.join(root, 'new.test.ts'),
    sourceHash: 'new',
  }
  function discovery(entries = [original]): WatchDiscovery {
    return {
      entryIds: entries.map((entry) => entry.id),
      discoveryRevision: entries.map((entry) => entry.id).join(','),
      registry: { configurationRevision: 'config', entries, inputs: [] },
    }
  }

  it('waits for cleanup and commits the baseline before a readiness-triggered addition', async () => {
    const started = deferred()
    const cleanup = deferred()
    const runs: WatchRun<WatchDiscovery>[] = []
    const settled: string[] = []
    const errors: unknown[] = []
    let current = discovery()
    const session = createWatchSession({
      discover: async () => current,
      async run(input) {
        runs.push(input)
        if (runs.length === 1) {
          started.resolve()
          await cleanup.promise
        }
        return { status: 'passed' }
      },
      onRunSettled(status) {
        settled.push(status)
        if (settled.length === 1) {
          current = discovery([original, added])
          session.invalidate({ registryPaths: [added.file] })
          expect(runs[0].signal.aborted).toBe(false)
        }
      },
      onError: (error) => errors.push(error),
    })
    try {
      await started.promise
      expect(settled).toEqual([])
      cleanup.resolve()
      await session.waitForIdle()
      expect(runs.map((run) => run.selection.entryIds)).toEqual([
        ['old'],
        ['new'],
      ])
      expect(runs[1].selection.reason).toBe('test-registry-addition')
      expect(settled).toEqual(['passed', 'passed'])
      expect(errors).toEqual([])
    } finally {
      cleanup.resolve()
      await session.close()
    }
  })

  it('does not announce a superseded run while its cleanup is outstanding', async () => {
    const started = deferred()
    const cleanup = deferred()
    const runs: WatchRun<WatchDiscovery>[] = []
    const settled: string[] = []
    const errors: unknown[] = []
    let current = discovery()
    const session = createWatchSession({
      discover: async () => current,
      async run(input) {
        runs.push(input)
        if (runs.length === 1) {
          started.resolve()
          await cleanup.promise
        }
        return { status: 'passed' }
      },
      onRunSettled: (_status, snapshot) =>
        settled.push(snapshot.discoveryRevision),
      onError: (error) => errors.push(error),
    })
    try {
      await started.promise
      current = discovery([original, added])
      session.invalidate({ registryPaths: [added.file] })
      expect(runs[0].signal.aborted).toBe(true)
      expect(settled).toEqual([])
      cleanup.resolve()
      await session.waitForIdle()
      expect(settled).toEqual(['old,new'])
      expect(runs[1].selection.entryIds).toEqual(['old', 'new'])
      expect(errors).toEqual([])
    } finally {
      cleanup.resolve()
      await session.close()
    }
  })

  it('reports a readiness publication failure and requires a complete retry', async () => {
    const failure = new Error('terminal publication failed')
    const runs: WatchRun<WatchDiscovery>[] = []
    const errors: unknown[] = []
    let current = discovery()
    let publications = 0
    const session = createWatchSession({
      discover: async () => current,
      async run(input) {
        runs.push(input)
        return { status: 'passed' }
      },
      onRunSettled() {
        if (++publications === 1) throw failure
      },
      onError: (error) => errors.push(error),
    })
    try {
      await session.waitForIdle()
      expect(errors).toEqual([failure])
      current = discovery([original, added])
      session.invalidate({ registryPaths: [added.file] })
      await session.waitForIdle()
      expect(runs[1].selection.entryIds).toEqual(['old', 'new'])
      expect(runs[1].selection.reason).toBe('global-invalidation')
      expect(publications).toBe(2)
      expect(errors).toEqual([failure])
    } finally {
      await session.close()
    }
  })
})

describe('follow-up runs requested by closed snapshot generations', () => {
  const snapshot = { entryIds: ['one'], discoveryRevision: 'same-inputs' }

  it('publishes the closed generation before scheduling its complete follow-up', async () => {
    const runs: WatchRun<WatchDiscovery>[] = []
    const settled: string[] = []
    const errors: unknown[] = []
    const session = createWatchSession({
      discover: async () => snapshot,
      async run(input) {
        runs.push(input)
        return { status: 'passed', rerunAfterSettled: runs.length === 1 }
      },
      onRunSettled(status) {
        settled.push(status)
        expect(runs.at(-1)!.signal.aborted).toBe(false)
      },
      onError: (error) => errors.push(error),
    })
    try {
      await session.waitForIdle()
      expect(runs.map((run) => run.generation)).toEqual([1, 2])
      expect(runs[1].selection.reason).toBe('global-invalidation')
      expect(settled).toEqual(['passed', 'passed'])
      expect(errors).toEqual([])
    } finally {
      await session.close()
    }
  })

  it('retains the complete follow-up when readiness publication throws', async () => {
    const failure = new Error('readiness output failed')
    const runs: WatchRun<WatchDiscovery>[] = []
    const errors: unknown[] = []
    let publications = 0
    const session = createWatchSession({
      discover: async () => snapshot,
      async run(input) {
        runs.push(input)
        return { status: 'passed', rerunAfterSettled: runs.length === 1 }
      },
      onRunSettled() {
        if (++publications === 1) throw failure
      },
      onError: (error) => errors.push(error),
    })
    try {
      await session.waitForIdle()
      expect(runs.map((run) => run.generation)).toEqual([1, 2])
      expect(runs[1].selection.reason).toBe('global-invalidation')
      expect(publications).toBe(2)
      expect(errors).toEqual([failure])
    } finally {
      await session.close()
    }
  })

  it('never publishes or follows up a generation with unsafe cleanup', async () => {
    const runs: WatchRun<WatchDiscovery>[] = []
    const settled: string[] = []
    const errors: unknown[] = []
    const session = createWatchSession({
      discover: async () => snapshot,
      async run(input) {
        runs.push(input)
        return {
          status: 'passed',
          unsafeCleanup: true,
          rerunAfterSettled: true,
        }
      },
      onRunSettled: (status) => settled.push(status),
      onError: (error) => errors.push(error),
    })
    try {
      await session.closed
      await session.waitForIdle()
      expect(runs).toHaveLength(1)
      expect(settled).toEqual([])
      expect(errors).toEqual([])
    } finally {
      await session.close()
    }
  })
})

it.each(['development', 'production'] as const)(
  'excludes the configured %s output parent while retaining sibling and unknown notifications',
  async (mode) => {
    const result = await promisify(execFile)(
      process.execPath,
      [
        path.join(__dirname, 'watch-output-root.cjs'),
        require.resolve(
          'next/dist/experimental/testing/compiler/watch-options'
        ),
        require.resolve(
          'next/dist/experimental/testing/incremental/watch-files'
        ),
        mode,
      ],
      { env: { ...process.env, NODE_ENV: mode }, timeout: 15000 }
    )
    // The genuine config observer uses module.register on Node 26.
    expect(result.stderr).toMatch(
      /^(?:\(node:\d+\) \[DEP0205\] DeprecationWarning: `module\.register\(\)` is deprecated\. Use `module\.registerHooks\(\)` instead\.\n\(Use `node --trace-deprecation \.\.\.` to show where the warning was created\)\n)?$/
    )
    expect(JSON.parse(result.stdout)).toEqual({
      mode,
      configuredOutputRootExcluded: true,
      actualArtifactParentPreserved: true,
      changedRelative: [
        'custom-cache-like/ordinary.mjs',
        'added.case.mjs',
        '.',
      ],
      errors: [],
      nativeSubscriptionsClosed: true,
    })
  }
)

it('reconciles exact source/config/setup/add/delete paths when native notifications are omitted', async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'next-testing-watch-reconcile-')
  )
  const output = path.join(root, 'custom-output')
  const artifact = path.join(root, '.next-test-fixture')
  const dependency = path.join(root, 'node_modules/helper/config.mjs')
  await mkdir(output)
  await mkdir(artifact)
  await mkdir(path.dirname(dependency), { recursive: true })
  await writeFile(dependency, 'first')
  class Subscription extends EventEmitter {
    closed = false
    close() {
      queueMicrotask(() => {
        this.closed = true
        this.emit('close')
      })
    }
  }
  const subscriptions: Subscription[] = []
  const nativeWatch = jest.spyOn(fs, 'watch').mockImplementation(() => {
    const subscription = new Subscription()
    subscriptions.push(subscription)
    return subscription as unknown as fs.FSWatcher
  })
  const changes: FileChange[] = []
  const errors: unknown[] = []
  let watcher: Awaited<ReturnType<typeof watchTestFiles>> | undefined
  try {
    watcher = await watchTestFiles({
      directories: [root],
      outputDirectories: [output],
      dependencyFiles: [dependency],
      artifactDirectories: [
        { parentDirectory: root, basenamePrefixes: ['.next-test-'] },
      ],
      onChange: (change) => changes.push(change),
      onError: (error) => errors.push(error),
    })
    // One actual native delivery updates the baseline. A later omitted event
    // must publish only its own path, rather than redelivering that first write.
    const delivered = path.join(root, 'native-source.ts')
    await writeFile(delivered, 'native update')
    const callback = Reflect.get(nativeWatch.mock.calls[0], 2) as unknown as (
      event: string,
      filename: string | null
    ) => void
    callback('rename', 'native-source.ts')
    await retry(async () => {
      expect(changes.flatMap((event) => event.changed)).toEqual([delivered])
    })
    changes.length = 0
    const omitted = path.join(root, 'omitted-source.ts')
    await writeFile(omitted, 'no native notification')
    await retry(async () => {
      expect(changes.flatMap((event) => event.changed)).toEqual([omitted])
    })
    changes.length = 0
    await writeFile(delivered, 'covered by broad native event')
    callback('rename', null)
    await retry(async () => {
      expect(changes.flatMap((event) => event.changed)).toEqual([root])
    })
    changes.length = 0
    const broadBarrier = path.join(root, 'after-broad-scope.ts')
    await writeFile(broadBarrier, 'later omitted native event')
    await retry(async () => {
      expect(changes.flatMap((event) => event.changed)).toEqual([broadBarrier])
    })
    for (const file of [
      path.join(root, 'source.ts'),
      path.join(root, '.env'),
      path.join(root, 'setup.ts'),
      path.join(root, 'added.test.ts'),
      dependency,
    ]) {
      for (const value of ['other', 'third']) {
        changes.length = 0
        await writeFile(file, value)
        await retry(async () => {
          expect(errors).toEqual([])
          expect(changes.flatMap((event) => event.changed)).toEqual([file])
        })
      }
    }
    changes.length = 0
    const removed = path.join(root, 'added.test.ts')
    await rm(removed)
    await retry(async () => {
      expect(changes.flatMap((event) => event.changed)).toEqual([removed])
    })
    changes.length = 0
    const original = path.join(root, 'source.ts')
    const renamed = path.join(root, 'renamed-source.ts')
    await fs.promises.rename(original, renamed)
    await retry(async () => {
      expect(changes.flatMap((event) => event.changed).sort()).toEqual(
        [original, renamed].sort()
      )
    })
    changes.length = 0
    await writeFile(path.join(output, 'emitted.js'), 'output')
    await writeFile(path.join(artifact, 'entry.js'), 'artifact')
    await writeFile(
      path.join(root, 'node_modules/helper/unrelated.js'),
      'installed'
    )
    await mkdir(path.join(root, '.git'))
    await writeFile(path.join(root, '.git/index'), 'git')
    const barrier = path.join(root, 'barrier.ts')
    await writeFile(barrier, 'source')
    await retry(async () => {
      expect(changes.flatMap((event) => event.changed)).toEqual([barrier])
      expect(errors).toEqual([])
    })
  } finally {
    await watcher?.close()
    nativeWatch.mockRestore()
    await rm(root, { recursive: true, force: true })
  }
  expect(subscriptions).toHaveLength(2)
  expect(subscriptions.every((subscription) => subscription.closed)).toBe(true)
}, 30000)

it('retains native changes until the initial reconciliation returns the watch source', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'next-testing-watch-ready-'))
  const entered = deferred()
  const release = deferred()
  const notification = deferred()
  const originalStat = fs.promises.stat
  let held = false
  const stat = jest
    .spyOn(fs.promises, 'stat')
    .mockImplementation(async (...args) => {
      if (!held && nativeWatch.mock.calls.length > 0) {
        held = true
        entered.resolve()
        await release.promise
      }
      return Reflect.apply(originalStat, fs.promises, args)
    })
  class Subscription extends EventEmitter {
    close() {
      queueMicrotask(() => this.emit('close'))
    }
  }
  const nativeWatch = jest
    .spyOn(fs, 'watch')
    .mockImplementation(() => new Subscription() as unknown as fs.FSWatcher)
  const originalTimeout = global.setTimeout
  const timeout = jest
    .spyOn(global, 'setTimeout')
    .mockImplementation((callback, delay, ...args) => {
      return originalTimeout(() => {
        Reflect.apply(callback, undefined, args)
        if (delay === 20) notification.resolve()
      }, delay)
    })
  const changes: FileChange[] = []
  const errors: unknown[] = []
  const opening = watchTestFiles({
    directories: [root],
    outputDirectories: [],
    onChange: (change) => changes.push(change),
    onError: (error) => errors.push(error),
  })
  let watcher: Awaited<ReturnType<typeof watchTestFiles>> | undefined
  try {
    await retry(async () => {
      expect(held).toBe(true)
    })
    await entered.promise
    const file = path.join(root, 'startup.test.ts')
    await writeFile(file, 'created before watch acquisition completed')
    const callback = Reflect.get(nativeWatch.mock.calls[0], 2) as unknown as (
      event: string,
      filename: string | null
    ) => void
    callback('rename', 'startup.test.ts')
    await notification.promise
    expect(changes).toEqual([])
    release.resolve()
    watcher = await opening
    await retry(async () => {
      expect(changes.flatMap((change) => change.changed)).toEqual([file])
      expect(errors).toEqual([])
    })
  } finally {
    release.resolve()
    watcher ??= await opening
    await watcher.close()
    timeout.mockRestore()
    nativeWatch.mockRestore()
    stat.mockRestore()
    await rm(root, { recursive: true, force: true })
  }
})

it('reports reconciliation failure and closes the acquired native subscriptions', async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'next-testing-watch-scan-error-')
  )
  await writeFile(path.join(root, 'source.ts'), 'input')
  class Subscription extends EventEmitter {
    closed = false
    close() {
      queueMicrotask(() => {
        this.closed = true
        this.emit('close')
      })
    }
  }
  const subscriptions: Subscription[] = []
  const nativeWatch = jest.spyOn(fs, 'watch').mockImplementation(() => {
    const subscription = new Subscription()
    subscriptions.push(subscription)
    return subscription as unknown as fs.FSWatcher
  })
  const failure = new Error('actual input scan failed')
  const originalLstat = fs.promises.lstat
  let failed = false
  const read = jest
    .spyOn(fs.promises, 'lstat')
    .mockImplementation(async (...args) => {
      if (!failed && nativeWatch.mock.calls.length > 0) {
        failed = true
        throw failure
      }
      return Reflect.apply(originalLstat, fs.promises, args)
    })
  const errors: unknown[] = []
  let acquired: Awaited<ReturnType<typeof watchTestFiles>> | undefined
  try {
    await expect(
      watchTestFiles({
        directories: [root],
        outputDirectories: [],
        onChange: jest.fn(),
        onError: (error) => errors.push(error),
      }).then((source) => {
        acquired = source
        return source
      })
    ).rejects.toBe(failure)
    expect(errors).toEqual([failure])
    expect(subscriptions).toHaveLength(2)
    expect(subscriptions.every((subscription) => subscription.closed)).toBe(
      true
    )
  } finally {
    await acquired?.close()
    read.mockRestore()
    nativeWatch.mockRestore()
    await rm(root, { recursive: true, force: true })
  }
})

it('awaits outstanding reconciliation reads before close releases the source', async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'next-testing-watch-scan-close-')
  )
  await writeFile(path.join(root, 'source.ts'), 'input')
  class Subscription extends EventEmitter {
    close() {
      queueMicrotask(() => this.emit('close'))
    }
  }
  const nativeWatch = jest
    .spyOn(fs, 'watch')
    .mockImplementation(() => new Subscription() as unknown as fs.FSWatcher)
  const entered = deferred()
  const release = deferred()
  const originalRead = fs.promises.lstat
  let hold = false
  let held = false
  const read = jest
    .spyOn(fs.promises, 'lstat')
    .mockImplementation(async (...args) => {
      if (hold && !held) {
        held = true
        entered.resolve()
        await release.promise
      }
      return Reflect.apply(originalRead, fs.promises, args)
    })
  const changes: FileChange[] = []
  const errors: unknown[] = []
  const watcher = await watchTestFiles({
    directories: [root],
    outputDirectories: [],
    onChange: (change) => changes.push(change),
    onError: (error) => errors.push(error),
  })
  try {
    hold = true
    await retry(async () => {
      expect(held).toBe(true)
    })
    await entered.promise
    let closed = false
    const closing = watcher.close().then(() => {
      closed = true
    })
    await Promise.resolve()
    expect(closed).toBe(false)
    release.resolve()
    await closing
    expect(closed).toBe(true)
    expect(changes).toEqual([])
    expect(errors).toEqual([])
  } finally {
    release.resolve()
    await watcher.close()
    read.mockRestore()
    nativeWatch.mockRestore()
    await rm(root, { recursive: true, force: true })
  }
})

it('does not repeat descendants covered by native populated-directory deletion or rename', async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'next-testing-watch-directory-')
  )
  const deleted = path.join(root, 'deleted')
  const moved = path.join(root, 'moved')
  const renamed = path.join(root, 'renamed')
  for (const directory of [deleted, moved]) {
    await mkdir(path.join(directory, 'nested'), { recursive: true })
    await writeFile(path.join(directory, 'nested/source.ts'), 'input')
  }
  class Subscription extends EventEmitter {
    close() {
      queueMicrotask(() => this.emit('close'))
    }
  }
  const nativeWatch = jest
    .spyOn(fs, 'watch')
    .mockImplementation(() => new Subscription() as unknown as fs.FSWatcher)
  const changes: FileChange[] = []
  const errors: unknown[] = []
  const watcher = await watchTestFiles({
    directories: [root],
    outputDirectories: [],
    onChange: (change) => changes.push(change),
    onError: (error) => errors.push(error),
  })
  const callback = Reflect.get(nativeWatch.mock.calls[0], 2) as (
    event: string,
    filename: string
  ) => void
  try {
    await rm(deleted, { recursive: true })
    callback('rename', 'deleted')
    await retry(async () => {
      expect(changes.flatMap((event) => event.changed)).toEqual([deleted])
    })
    changes.length = 0
    const firstBarrier = path.join(root, 'after-delete.ts')
    await writeFile(firstBarrier, 'omitted native notification')
    await retry(async () => {
      expect(changes.flatMap((event) => event.changed)).toEqual([firstBarrier])
    })
    changes.length = 0
    await fs.promises.rename(moved, renamed)
    callback('rename', 'moved')
    callback('rename', 'renamed')
    await retry(async () => {
      expect(changes.flatMap((event) => event.changed)).toEqual([
        moved,
        renamed,
      ])
    })
    changes.length = 0
    const secondBarrier = path.join(root, 'after-rename.ts')
    await writeFile(secondBarrier, 'omitted native notification')
    await retry(async () => {
      expect(changes.flatMap((event) => event.changed)).toEqual([secondBarrier])
      expect(errors).toEqual([])
    })
  } finally {
    await watcher.close()
    nativeWatch.mockRestore()
    await rm(root, { recursive: true, force: true })
  }
})

describe('watch configuration fences during periodic input reconciliation', () => {
  async function controlledSource(
    directories: Parameters<typeof watchTestFiles>[0]
  ) {
    class Subscription extends EventEmitter {
      closed = false
      close() {
        queueMicrotask(() => {
          this.closed = true
          this.emit('close')
        })
      }
    }
    const subscriptions: Subscription[] = []
    const nativeWatch = jest.spyOn(fs, 'watch').mockImplementation(() => {
      const subscription = new Subscription()
      subscriptions.push(subscription)
      return subscription as unknown as fs.FSWatcher
    })
    const periodic: {
      callback(): void
      timer: ReturnType<typeof setTimeout>
    }[] = []
    const originalTimeout = global.setTimeout
    const timeout = jest
      .spyOn(global, 'setTimeout')
      .mockImplementation((callback, delay, ...args) => {
        if (delay !== 1000) return originalTimeout(callback, delay, ...args)
        const timer = originalTimeout(() => {}, 60000)
        periodic.push({
          callback: () => Reflect.apply(callback, undefined, args),
          timer,
        })
        return timer
      })
    const gates = new Map<
      string,
      {
        entered: ReturnType<typeof deferred>
        release: ReturnType<typeof deferred>
      }[]
    >()
    const originals = {
      stat: fs.promises.stat,
      lstat: fs.promises.lstat,
    }
    const reads = (['stat', 'lstat'] as const).map((name) =>
      jest.spyOn(fs.promises, name).mockImplementation(async (...args) => {
        // Keep the actual read result: native delivery must merge a path whose
        // stale metadata is already owned by the asynchronous scan.
        const result = await Reflect.apply(originals[name], fs.promises, args)
        const gate = gates.get(String(args[0]))?.shift()
        if (gate) {
          gate.entered.resolve()
          await gate.release.promise
        }
        return result
      })
    )
    const watcher = await watchTestFiles(directories)
    return {
      watcher,
      subscriptions,
      hold(file: string) {
        const gate = { entered: deferred(), release: deferred() }
        const pending = gates.get(file) ?? []
        pending.push(gate)
        gates.set(file, pending)
        return gate
      },
      async scan() {
        await retry(async () => expect(periodic).toHaveLength(1))
        const next = periodic.shift()!
        clearTimeout(next.timer)
        next.callback()
      },
      notify(root: string, filename: string) {
        const call = nativeWatch.mock.calls.find(
          (args) => args[0] === root && Reflect.get(args[1]!, 'recursive')
        )!
        const callback = Reflect.get(call, 2) as (
          event: string,
          filename: string
        ) => void
        callback('change', filename)
      },
      async restore() {
        // Tests release consumed gates in their own finally blocks. Pending
        // gates must also be released if an assertion interrupts acquisition.
        for (const pending of gates.values())
          for (const gate of pending) gate.release.resolve()
        await watcher.close()
        for (const next of periodic) clearTimeout(next.timer)
        for (const read of reads) read.mockRestore()
        timeout.mockRestore()
        nativeWatch.mockRestore()
      },
    }
  }

  it('returns an unchanged configuration without joining the live scan and retains native and omitted changes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'next-testing-watch-same-'))
    const native = path.join(root, 'native.ts')
    const omitted = path.join(root, 'omitted.ts')
    const barrier = path.join(root, 'barrier.ts')
    await writeFile(native, 'before')
    const changes: FileChange[] = []
    const errors: unknown[] = []
    const options = {
      directories: [root],
      outputDirectories: [],
      onChange: (change: FileChange) => changes.push(change),
      onError: (error: unknown) => errors.push(error),
    }
    const source = await controlledSource(options)
    const rootRead = source.hold(root)
    const nativeRead = source.hold(native)
    try {
      await source.scan()
      await rootRead.entered.promise
      let updated = false
      const updating = source.watcher.update(options).then(() => {
        updated = true
      })
      await new Promise<void>(setImmediate)
      expect(updated).toBe(true)
      await updating
      await writeFile(omitted, 'missed notification during unchanged update')
      rootRead.release.resolve()
      await nativeRead.entered.promise
      await writeFile(native, 'delivered after this scan read old metadata')
      source.notify(root, 'native.ts')
      await retry(async () => {
        expect(changes.flatMap((change) => change.changed)).toEqual([native])
      })
      nativeRead.release.resolve()
      await retry(async () => {
        expect(changes.flatMap((change) => change.changed)).toEqual([
          native,
          omitted,
        ])
      })
      await writeFile(barrier, 'next reconciliation must not repeat native')
      await source.scan()
      await retry(async () => {
        expect(changes.flatMap((change) => change.changed)).toEqual([
          native,
          omitted,
          barrier,
        ])
        expect(errors).toEqual([])
      })
    } finally {
      rootRead.release.resolve()
      nativeRead.release.resolve()
      await source.restore()
      await rm(root, { recursive: true, force: true })
    }
    expect(
      source.subscriptions.every((subscription) => subscription.closed)
    ).toBe(true)
  })

  it.each(['roots', 'outputs', 'output files', 'dependencies', 'artifacts'])(
    'awaits the old scan and a new baseline when %s change, including an identical update before that baseline exists',
    async (kind) => {
      const parent = await mkdtemp(
        path.join(tmpdir(), 'next-testing-watch-config-')
      )
      const root = path.join(parent, 'first')
      const other = path.join(parent, 'second')
      const dependency = path.join(root, 'node_modules/helper/config.mjs')
      await mkdir(path.dirname(dependency), { recursive: true })
      await mkdir(other)
      await writeFile(dependency, 'config')
      const options = {
        directories: [root],
        outputDirectories: [],
        onChange: jest.fn(),
        onError: jest.fn(),
      }
      const source = await controlledSource(options)
      const oldRead = source.hold(root)
      const nextOptions = {
        ...options,
        ...(kind === 'roots' ? { directories: [other] } : {}),
        ...(kind === 'outputs'
          ? { outputDirectories: [path.join(root, 'build')] }
          : {}),
        ...(kind === 'output files'
          ? { outputFiles: [path.join(root, 'result.json')] }
          : {}),
        ...(kind === 'dependencies' ? { dependencyFiles: [dependency] } : {}),
        ...(kind === 'artifacts'
          ? {
              artifactDirectories: [
                { parentDirectory: root, basenamePrefixes: ['.snapshot-'] },
              ],
            }
          : {}),
      }
      let newRead: ReturnType<typeof source.hold> | undefined
      try {
        await source.scan()
        await oldRead.entered.promise
        newRead = source.hold(nextOptions.directories[0])
        let updates = 0
        const first = source.watcher.update(nextOptions).then(() => updates++)
        const second = source.watcher.update(nextOptions).then(() => updates++)
        await new Promise<void>(setImmediate)
        expect(updates).toBe(0)
        oldRead.release.resolve()
        await newRead.entered.promise
        expect(updates).toBe(0)
        newRead.release.resolve()
        await Promise.all([first, second])
        expect(updates).toBe(2)
        expect(options.onChange).not.toHaveBeenCalled()
        expect(options.onError).not.toHaveBeenCalled()
      } finally {
        oldRead.release.resolve()
        newRead?.release.resolve()
        await source.restore()
        await rm(parent, { recursive: true, force: true })
      }
      expect(
        source.subscriptions.every((subscription) => subscription.closed)
      ).toBe(true)
    }
  )

  it.each(['close', 'failure'])(
    'drains every started filesystem read on %s after an unchanged update returns',
    async (kind) => {
      const root = await mkdtemp(
        path.join(tmpdir(), 'next-testing-watch-drain-')
      )
      const files = [path.join(root, 'first.ts'), path.join(root, 'second.ts')]
      await Promise.all(files.map((file) => writeFile(file, 'source')))
      const failure = new Error(
        'native subscription failed during periodic scan'
      )
      const options = {
        directories: [root],
        outputDirectories: [],
        onChange: jest.fn(),
        onError: jest.fn(),
      }
      const source = await controlledSource(options)
      const reads = files.map((file) => source.hold(file))
      try {
        await source.scan()
        await Promise.all(reads.map((read) => read.entered.promise))
        let updated = false
        const updating = source.watcher.update(options).then(() => {
          updated = true
        })
        await new Promise<void>(setImmediate)
        expect(updated).toBe(true)
        await updating
        if (kind === 'failure') source.subscriptions[0].emit('error', failure)
        let closed = false
        const closing = source.watcher.close().then(() => {
          closed = true
        })
        await new Promise<void>(setImmediate)
        expect(closed).toBe(false)
        reads[0].release.resolve()
        await new Promise<void>(setImmediate)
        expect(closed).toBe(false)
        reads[1].release.resolve()
        await closing
        expect(closed).toBe(true)
        expect(options.onChange).not.toHaveBeenCalled()
        expect(options.onError.mock.calls).toEqual(
          kind === 'failure' ? [[failure]] : []
        )
      } finally {
        for (const read of reads) read.release.resolve()
        await source.restore()
        await rm(root, { recursive: true, force: true })
      }
      expect(
        source.subscriptions.every((subscription) => subscription.closed)
      ).toBe(true)
    }
  )
})

describe('bounded watch input read scheduling', () => {
  it('continues ready paths while one read is held, retaining the whole baseline and the read bound', async () => {
    const { readWatchInputSnapshot } = await import(
      'next/dist/experimental/testing/incremental/watch-input-snapshot'
    )
    const temporary = await mkdtemp(path.join(tmpdir(), 'next-watch-slots-'))
    const root = path.join(temporary, 'inputs')
    const outside = path.join(temporary, 'outside')
    const ignored = path.join(root, 'ignored')
    await mkdir(root)
    await mkdir(outside)
    await mkdir(ignored)
    const files = Array.from({ length: 512 }, (_, index) =>
      path.join(root, `${String(index).padStart(3, '0')}.ts`)
    )
    await Promise.all(files.map((file) => writeFile(file, file)))
    await writeFile(path.join(ignored, 'hidden.ts'), 'ignored')
    await writeFile(path.join(outside, 'unfollowed.ts'), 'not a root')
    const link = path.join(root, 'linked')
    await symlink(outside, link, 'dir')
    const entered = deferred()
    const release = deferred()
    const originalRead = fs.promises.lstat
    let active = 0
    let maximum = 0
    const completed = new Set<string>()
    const read = jest
      .spyOn(fs.promises, 'lstat')
      .mockImplementation(async (...args) => {
        active++
        maximum = Math.max(maximum, active)
        try {
          const value = await Reflect.apply(originalRead, fs.promises, args)
          if (String(args[0]) === files[0]) {
            entered.resolve()
            await release.promise
          }
          completed.add(String(args[0]))
          return value
        } finally {
          active--
        }
      })
    let settled = false
    const scanning = readWatchInputSnapshot({
      roots: [root],
      files: [],
      ignored: (file) =>
        file === ignored || file.startsWith(ignored + path.sep),
      signal: new AbortController().signal,
    }).finally(() => {
      settled = true
    })
    try {
      await entered.promise
      await retry(
        async () => {
          expect(completed.has(files[files.length - 1])).toBe(true)
          expect(completed.size).toBe(files.length)
        },
        3000,
        10
      )
      expect(settled).toBe(false)
      expect(maximum).toBeGreaterThan(1)
      expect(maximum).toBeLessThanOrEqual(32)
      expect(completed.has(ignored)).toBe(false)
      release.resolve()
      const snapshot = await scanning
      expect([...snapshot.keys()].sort()).toEqual([root, ...files, link].sort())
      expect(snapshot.get(root)).toMatch(/^directory:/)
      expect(snapshot.get(files[0])).not.toMatch(/^directory:/)
      expect(snapshot.get(link)).not.toMatch(/^directory:/)
      expect(active).toBe(0)
    } finally {
      release.resolve()
      await scanning.catch(() => {})
      read.mockRestore()
      await rm(temporary, { recursive: true, force: true })
    }
  })

  it.each(['cancel', 'failure'] as const)(
    'joins every started read before %s releases the scanner',
    async (mode) => {
      const { readWatchInputSnapshot } = await import(
        'next/dist/experimental/testing/incremental/watch-input-snapshot'
      )
      const root = await mkdtemp(path.join(tmpdir(), 'next-watch-owned-reads-'))
      const held = path.join(root, '00-held.ts')
      const other = path.join(root, '01-other.ts')
      await writeFile(held, 'held real input')
      await writeFile(other, 'other real input')
      const entered = deferred()
      const release = deferred()
      const otherDone = deferred()
      const originalRead = fs.promises.lstat
      const failure = new Error(`owned ${mode} input read`)
      let active = 0
      const read = jest
        .spyOn(fs.promises, 'lstat')
        .mockImplementation(async (...args) => {
          active++
          try {
            const value = await Reflect.apply(originalRead, fs.promises, args)
            if (String(args[0]) === held) {
              entered.resolve()
              await release.promise
            } else if (String(args[0]) === other) {
              otherDone.resolve()
              if (mode === 'failure') throw failure
            }
            return value
          } finally {
            active--
          }
        })
      const controller = new AbortController()
      let settled = false
      const scanning = readWatchInputSnapshot({
        roots: [root],
        files: [],
        ignored: () => false,
        signal: controller.signal,
      }).finally(() => {
        settled = true
      })
      try {
        await entered.promise
        await otherDone.promise
        if (mode === 'cancel') controller.abort(failure)
        await new Promise<void>((resolve) => setImmediate(resolve))
        expect(settled).toBe(false)
        expect(active).toBe(1)
        release.resolve()
        await expect(scanning).rejects.toBe(failure)
        expect(active).toBe(0)
      } finally {
        release.resolve()
        await scanning.catch(() => {})
        read.mockRestore()
        await rm(root, { recursive: true, force: true })
      }
    }
  )
})

it('retains real missing-root errors and observes child symlink replacement without following it', async () => {
  const { readWatchInputSnapshot } = await import(
    'next/dist/experimental/testing/incremental/watch-input-snapshot'
  )
  const temporary = await mkdtemp(path.join(tmpdir(), 'next-watch-link-facts-'))
  const root = path.join(temporary, 'inputs')
  const alias = path.join(temporary, 'root-alias')
  const externalDirectory = path.join(temporary, 'external')
  const externalFile = path.join(temporary, 'external.ts')
  await mkdir(root)
  await mkdir(externalDirectory)
  await writeFile(path.join(externalDirectory, 'hidden.ts'), 'not followed')
  await writeFile(externalFile, 'not followed either')
  await symlink(root, alias, 'dir')
  const link = path.join(root, 'child')
  await symlink(externalDirectory, link, 'dir')
  const options = {
    roots: [alias],
    files: [],
    ignored: () => false,
    signal: new AbortController().signal,
  }
  try {
    const first = await readWatchInputSnapshot(options)
    expect([...first.keys()].sort()).toEqual(
      [alias, path.join(alias, 'child')].sort()
    )
    expect(first.get(alias)).toMatch(/^directory:/)
    expect(first.get(path.join(alias, 'child'))).not.toMatch(/^directory:/)
    await rm(link)
    await symlink(externalFile, link)
    const second = await readWatchInputSnapshot(options)
    expect([...second.keys()].sort()).toEqual([...first.keys()].sort())
    expect(second.get(path.join(alias, 'child'))).not.toBe(
      first.get(path.join(alias, 'child'))
    )
    await expect(
      readWatchInputSnapshot({
        ...options,
        roots: [path.join(temporary, 'missing')],
      })
    ).rejects.toMatchObject({ code: 'ENOENT' })
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

it('retains authored AGENTS.md creation, edits and deletion as real watch inputs', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'next-watch-agent-input-'))
  const file = path.join(root, 'AGENTS.md')
  const changes: FileChange[] = []
  const errors: unknown[] = []
  let watcher: Awaited<ReturnType<typeof watchTestFiles>> | undefined
  try {
    watcher = await watchTestFiles({
      directories: [root],
      outputDirectories: [],
      onChange: (change) => changes.push(change),
      onError: (error) => errors.push(error),
    })
    for (const content of [
      '# Authored first rules\n',
      '# Authored changed rules\n',
      null,
    ]) {
      const start = changes.length
      if (content === null) await rm(file)
      else await writeFile(file, content)
      await retry(async () => {
        expect(
          changes
            .slice(start)
            .some(
              (change) =>
                change.changed.includes(file) || change.changed.includes(root)
            )
        ).toBe(true)
      })
      expect(fs.existsSync(file)).toBe(content !== null)
      if (content !== null) expect(fs.readFileSync(file, 'utf8')).toBe(content)
    }
    expect(errors).toEqual([])
  } finally {
    try {
      await watcher?.close()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }
})

describe('closed retained setup source selection', () => {
  type UnchangedInput = Parameters<
    NonNullable<
      import('next/dist/experimental/testing/incremental/watch-session').WatchSessionOptions<WatchDiscovery>['canSkipUnchangedRun']
    >
  >[0]
  const setupFile = path.resolve('/retained/setup.mjs')
  const entryFile = path.resolve('/retained/one.test.mjs')
  const configFile = path.resolve('/retained/next.test.config.json')
  const registry = (setupHash = 'setup-1'): WatchRegistrySnapshot => ({
    configurationRevision: 'retained-config-1',
    entries: [{ id: 'one', file: entryFile, sourceHash: 'entry-1' }],
    inputs: [
      { file: setupFile, sourceHash: setupHash },
      { file: configFile, sourceHash: 'config-1' },
    ],
  })
  const matching = async (options: {
    previous: WatchRegistrySnapshot | undefined
    current: WatchRegistrySnapshot | undefined
    changedPaths: readonly string[] | undefined
    setupFiles?: readonly string[]
  }) => {
    const { matchesRetainedSetupChange } = await import(
      'next/dist/experimental/testing/incremental/registry-additions'
    )
    return matchesRetainedSetupChange({ setupFiles: [setupFile], ...options })
  }

  it('admits only existing owned setup paths while every other input and entry stays identical', async () => {
    expect(
      await matching({
        previous: registry(),
        current: registry('setup-2'),
        changedPaths: [setupFile, setupFile],
      })
    ).toBe(true)
    const controls = [
      { previous: undefined },
      { current: undefined },
      { changedPaths: undefined },
      { changedPaths: [] },
      { changedPaths: [setupFile, entryFile] },
      { changedPaths: ['setup.mjs'] },
      { setupFiles: [] },
      { current: { ...registry(), configurationRevision: 'other-config' } },
      {
        current: {
          ...registry(),
          entries: [{ id: 'one', file: entryFile, sourceHash: 'changed' }],
        },
      },
      { current: { ...registry(), entries: [] } },
      {
        current: {
          ...registry(),
          entries: [...registry().entries, ...registry().entries],
        },
      },
      {
        current: {
          ...registry(),
          inputs: [{ file: setupFile, sourceHash: 'setup-2' }],
        },
      },
      {
        current: {
          ...registry(),
          inputs: [
            { file: setupFile, sourceHash: 'setup-2' },
            { file: configFile, sourceHash: 'changed-config' },
          ],
        },
      },
      {
        current: {
          ...registry(),
          inputs: [...registry().inputs, ...registry().inputs],
        },
      },
    ]
    for (const control of controls)
      expect(
        await matching({
          previous: registry(),
          current: registry('setup-2'),
          changedPaths: [setupFile],
          ...control,
        })
      ).toBe(false)
  })

  it('commits the observed setup baseline without replacing a machine run, then selects only a new test', async () => {
    let current = registry()
    let revision = 'entries-1'
    const runs: string[][] = []
    const proof = jest.fn(
      async ({ previousRegistry, discovery, changedPaths }: UnchangedInput) =>
        matching({
          previous: previousRegistry,
          current: discovery.registry,
          changedPaths,
        })
    )
    const session = createWatchSession({
      runEmpty: true,
      discover: async () => ({
        entryIds: current.entries.map((entry) => entry.id),
        discoveryRevision: revision,
        registry: current,
      }),
      canSkipUnchangedRun: proof,
      run: async ({ selection }) => {
        runs.push(selection.entryIds)
        return { status: 'passed' as const }
      },
      onError: (error) => {
        throw error
      },
    })
    try {
      await session.waitForIdle()
      expect(proof).not.toHaveBeenCalled()
      current = registry('setup-2')
      session.invalidate({ registryPaths: [setupFile] })
      await session.waitForIdle()
      expect(runs).toEqual([['one']])
      expect(proof).toHaveBeenCalledTimes(1)
      const added = path.resolve('/retained/new.test.mjs')
      current = {
        ...current,
        entries: [
          ...current.entries,
          { id: 'new', file: added, sourceHash: 'new-1' },
        ],
      }
      revision = 'entries-2'
      session.invalidate({ registryPaths: [added] })
      await session.waitForIdle()
      expect(runs).toEqual([['one'], ['new']])
      expect(proof).toHaveBeenCalledTimes(1)
    } finally {
      await session.close()
    }
  })

  it.each(['failed', 'cancelled'] as const)(
    'does not reuse a %s run as a successful baseline',
    async (status) => {
      const proof = jest.fn(async () => true)
      let nextStatus: 'passed' | 'failed' | 'cancelled' = 'passed'
      const run = jest.fn(async () => ({ status: nextStatus }))
      const session = createWatchSession({
        discover: async () => ({
          entryIds: ['one'],
          discoveryRevision: 'same',
          registry: registry(),
        }),
        canSkipUnchangedRun: proof,
        run,
        onError: (error) => {
          throw error
        },
      })
      try {
        await session.waitForIdle()
        nextStatus = status
        session.invalidate({ invalidateAll: true })
        await session.waitForIdle()
        session.invalidate({ registryPaths: [setupFile] })
        await session.waitForIdle()
        expect(run).toHaveBeenCalledTimes(3)
        expect(proof).not.toHaveBeenCalled()
      } finally {
        await session.close()
      }
    }
  )

  it('rejects a superseded proof after its actual owner settles and reruns the complete next batch', async () => {
    const entered = deferred()
    const released = deferred()
    let proofSignal: AbortSignal | undefined
    const proof = jest.fn(async ({ signal }: UnchangedInput) => {
      proofSignal = signal
      entered.resolve()
      await released.promise
      return true
    })
    const runs: string[][] = []
    const session = createWatchSession({
      discover: async () => ({
        entryIds: ['one'],
        discoveryRevision: 'same',
        registry: registry(),
      }),
      canSkipUnchangedRun: proof,
      run: async ({ selection }) => {
        runs.push(selection.entryIds)
        return { status: 'passed' as const }
      },
      onError: (error) => {
        throw error
      },
    })
    try {
      await session.waitForIdle()
      session.invalidate({ registryPaths: [setupFile] })
      await entered.promise
      session.invalidate({ registryPaths: [entryFile] })
      expect(proofSignal?.aborted).toBe(true)
      expect(runs).toEqual([['one']])
      released.resolve()
      await session.waitForIdle()
      expect(runs).toEqual([['one'], ['one']])
      expect(proof).toHaveBeenCalledTimes(1)
    } finally {
      released.resolve()
      await session.close()
    }
  })

  it('joins a cancelled selector before session close releases ownership', async () => {
    const entered = deferred()
    const released = deferred()
    const proof = jest.fn(async ({ signal }: UnchangedInput) => {
      entered.resolve()
      await released.promise
      expect(signal.aborted).toBe(true)
      return true
    })
    const run = jest.fn(async () => ({ status: 'passed' as const }))
    const session = createWatchSession({
      discover: async () => ({ entryIds: ['one'], discoveryRevision: 'same' }),
      canSkipUnchangedRun: proof,
      run,
      onError: (error) => {
        throw error
      },
    })
    await session.waitForIdle()
    session.invalidate({ registryPaths: [setupFile] })
    await entered.promise
    let closed = false
    const closing = session.close().then(() => {
      closed = true
    })
    await Promise.resolve()
    expect(closed).toBe(false)
    released.resolve()
    await closing
    expect(run).toHaveBeenCalledTimes(1)
  })
})

describe('closed compiler watch refinement', () => {
  const discovery: WatchDiscovery = {
    entryIds: ['alpha', 'beta'],
    discoveryRevision: 'all-watched-entries',
  }

  it('awaits a compiler selection without shrinking watched discovery', async () => {
    const ready = deferred()
    const entered = deferred()
    const runs: WatchRun<WatchDiscovery>[] = []
    const session = createWatchSession({
      discover: async () => discovery,
      async selectTests({ discovery: current }) {
        expect(current.entryIds).toEqual(['alpha', 'beta'])
        entered.resolve()
        await ready.promise
        return { entryIds: ['alpha'], reason: 'compiler-dependencies' }
      },
      async run(run) {
        runs.push(run)
        return { status: 'passed' }
      },
      onError(error) {
        throw error
      },
    })
    try {
      await entered.promise
      expect(runs).toEqual([])
      ready.resolve()
      await session.waitForIdle()
      expect(runs).toHaveLength(1)
      expect(runs[0].selection.entryIds).toEqual(['alpha'])
      expect(runs[0].discovery.entryIds).toEqual(['alpha', 'beta'])
    } finally {
      ready.resolve()
      await session.close()
    }
  })

  it('joins a superseded compiler plan before running the next selection', async () => {
    const ready = deferred()
    const entered = deferred()
    let firstSignal: AbortSignal | undefined
    let plans = 0
    const runs: WatchRun<WatchDiscovery>[] = []
    const session = createWatchSession({
      discover: async () => discovery,
      async selectTests({ signal, changedPaths }) {
        if (++plans === 1) {
          firstSignal = signal
          entered.resolve()
          await ready.promise
          return { entryIds: ['alpha'], reason: 'compiler-dependencies' }
        }
        expect(changedPaths).toEqual(['/sources/beta.mjs'])
        return { entryIds: ['beta'], reason: 'compiler-dependencies' }
      },
      async run(run) {
        runs.push(run)
        return { status: 'passed' }
      },
      onError(error) {
        throw error
      },
    })
    try {
      await entered.promise
      session.invalidate({ registryPaths: ['/sources/beta.mjs'] })
      expect(firstSignal!.aborted).toBe(true)
      expect(runs).toEqual([])
      ready.resolve()
      await session.waitForIdle()
      expect(plans).toBe(2)
      expect(runs).toHaveLength(1)
      expect(runs[0].selection.entryIds).toEqual(['beta'])
    } finally {
      ready.resolve()
      await session.close()
    }
  })

  it.each([['foreign'], ['alpha', 'alpha']])(
    'refuses invalid compiler entry selection %j',
    async (...entryIds: string[]) => {
      const errors: unknown[] = []
      const run = jest.fn(async () => ({ status: 'passed' as const }))
      const session = createWatchSession({
        discover: async () => discovery,
        selectTests: async () => ({
          entryIds,
          reason: 'compiler-dependencies',
        }),
        run,
        onError: (error) => errors.push(error),
      })
      try {
        await session.waitForIdle()
        expect(run).not.toHaveBeenCalled()
        expect(errors).toHaveLength(1)
        expect(String(errors[0])).toContain('unknown entries')
      } finally {
        await session.close()
      }
    }
  )

  it('retains ordinary selection when the compiler cannot refine a generation', async () => {
    const selections: string[][] = []
    const session = createWatchSession({
      discover: async () => discovery,
      selectTests: async () => undefined,
      async run({ selection }) {
        selections.push(selection.entryIds)
        return { status: 'passed' }
      },
      onError(error) {
        throw error
      },
    })
    try {
      await session.waitForIdle()
      session.invalidate({ registryPaths: ['/unknown/source.mjs'] })
      await session.waitForIdle()
      expect(selections).toEqual([
        ['alpha', 'beta'],
        ['alpha', 'beta'],
      ])
    } finally {
      await session.close()
    }
  })
})

it('skips an exact empty compiler selection while retaining future watched entries', async () => {
  let selected: string[] = []
  const run = jest.fn(async (_run: WatchRun<WatchDiscovery>) => ({
    status: 'passed' as const,
  }))
  const session = createWatchSession({
    runEmpty: true,
    discover: async () => ({
      entryIds: ['alpha', 'beta'],
      discoveryRevision: 'all-watched-entries',
    }),
    selectTests: async () => ({
      entryIds: selected,
      reason: 'compiler-dependencies',
    }),
    run,
    onError(error) {
      throw error
    },
  })
  try {
    await session.waitForIdle()
    expect(run).not.toHaveBeenCalled()
    selected = ['beta']
    session.invalidate({ registryPaths: ['/sources/beta.mjs'] })
    await session.waitForIdle()
    expect(run).toHaveBeenCalledTimes(1)
    expect(run.mock.calls[0][0].selection.entryIds).toEqual(['beta'])
  } finally {
    await session.close()
  }
})

it('joins the initial empty report before readiness and skips later empty selections', async () => {
  let selected: string[] = []
  const entered = deferred()
  const published = deferred()
  const ready = jest.fn()
  const runs: string[][] = []
  const session = createWatchSession({
    runEmpty: true,
    publishInitialEmptySelection: () => true,
    discover: async () => ({
      entryIds: ['alpha', 'beta'],
      discoveryRevision: 'all-watched-entries',
    }),
    selectTests: async () => ({
      entryIds: selected,
      reason: 'compiler-dependencies',
    }),
    async run({ selection }) {
      runs.push([...selection.entryIds])
      if (runs.length === 1) {
        entered.resolve()
        await published.promise
      }
      return { status: 'passed' }
    },
    onRunSettled: ready,
    onError(error) {
      throw error
    },
  })
  try {
    await entered.promise
    expect(runs).toEqual([[]])
    expect(ready).not.toHaveBeenCalled()
    published.resolve()
    await session.waitForIdle()
    expect(ready).toHaveBeenCalledTimes(1)
    session.invalidate({ registryPaths: ['/unrelated.mjs'] })
    await session.waitForIdle()
    expect(runs).toEqual([[]])
    selected = ['beta']
    session.invalidate({ registryPaths: ['/sources/beta.mjs'] })
    await session.waitForIdle()
    expect(runs).toEqual([[], ['beta']])
  } finally {
    published.resolve()
    await session.close()
  }
})

it('joins cancelled initial empty reports before publishing a replacement generation', async () => {
  const entered = deferred()
  const closed = deferred()
  const ready = jest.fn()
  let firstSignal: AbortSignal | undefined
  let runs = 0
  const session = createWatchSession({
    runEmpty: true,
    publishInitialEmptySelection: () => true,
    discover: async () => ({
      entryIds: ['alpha', 'beta'],
      discoveryRevision: 'all-watched-entries',
    }),
    selectTests: async () => ({
      entryIds: [],
      reason: 'compiler-dependencies',
    }),
    async run({ signal }) {
      runs++
      if (runs === 1) {
        firstSignal = signal
        entered.resolve()
        await closed.promise
        signal.throwIfAborted()
      }
      return { status: 'passed' }
    },
    onRunSettled: ready,
    onError(error) {
      throw error
    },
  })
  try {
    await entered.promise
    session.invalidate({ registryPaths: ['/unrelated.mjs'] })
    expect(firstSignal!.aborted).toBe(true)
    expect(ready).not.toHaveBeenCalled()
    expect(runs).toBe(1)
    closed.resolve()
    await session.waitForIdle()
    expect(runs).toBe(2)
    expect(ready).toHaveBeenCalledTimes(1)
  } finally {
    closed.resolve()
    await session.close()
  }
})

it.each(['custom', 'standard'] as const)(
  'does not reuse initial empty admission after cancellation adds %s coverage',
  async (coverageKind) => {
    const entered = deferred()
    const closed = deferred()
    const ready = jest.fn()
    let coverage: typeof coverageKind | undefined
    let revision = 'without-coverage'
    let firstSignal: AbortSignal | undefined
    let selected: string[] = []
    const runs: string[][] = []
    const admission = jest.fn(
      (discovery: WatchDiscovery & { coverage: typeof coverage }) =>
        discovery.coverage === undefined
    )
    const session = createWatchSession({
      runEmpty: true,
      publishInitialEmptySelection: admission,
      discover: async () => ({
        entryIds: ['alpha', 'beta'],
        discoveryRevision: revision,
        coverage,
      }),
      selectTests: async () => ({
        entryIds: selected,
        reason: 'compiler-dependencies',
      }),
      async run({ selection, signal }) {
        runs.push([...selection.entryIds])
        if (runs.length === 1) {
          firstSignal = signal
          entered.resolve()
          await closed.promise
          signal.throwIfAborted()
        }
        return { status: 'passed' }
      },
      onRunSettled: ready,
      onError(error) {
        throw error
      },
    })
    try {
      await entered.promise
      expect(admission.mock.results.map((result) => result.value)).toEqual([
        true,
      ])
      coverage = coverageKind
      revision = 'with-coverage'
      session.invalidate({ invalidateAll: true })
      expect(firstSignal!.aborted).toBe(true)
      expect(ready).not.toHaveBeenCalled()
      closed.resolve()
      await session.waitForIdle()
      expect(runs).toEqual([[]])
      expect(admission.mock.results.map((result) => result.value)).toEqual([
        true,
        false,
      ])
      expect(ready).toHaveBeenCalledTimes(1)
      selected = ['beta']
      session.invalidate({ registryPaths: ['/sources/beta.mjs'] })
      await session.waitForIdle()
      expect(runs).toEqual([[], ['beta']])
    } finally {
      closed.resolve()
      await session.close()
    }
  }
)

it('evaluates empty publication once against each fresh discovery when coverage is enabled and disabled', async () => {
  let enabled = false
  const admissions: boolean[] = []
  const runs: boolean[] = []
  const session = createWatchSession({
    discover: async () => ({
      entryIds: [],
      discoveryRevision: String(enabled),
      coverage: enabled,
    }),
    runEmpty(discovery) {
      admissions.push(discovery.coverage)
      return discovery.coverage
    },
    async run({ discovery }) {
      runs.push(discovery.coverage)
      return { status: 'passed' }
    },
    onError(error) {
      throw error
    },
  })
  try {
    await session.waitForIdle()
    expect(runs).toEqual([])
    enabled = true
    session.invalidate({ invalidateAll: true })
    await session.waitForIdle()
    expect(runs).toEqual([true])
    enabled = false
    session.invalidate({ invalidateAll: true })
    await session.waitForIdle()
    expect(runs).toEqual([true])
    expect(admissions).toEqual([false, true, false])
  } finally {
    await session.close()
  }
})

it('publishes closed user-cancellation readiness without certifying a new selection baseline', async () => {
  const cleanup = deferred()
  const entered = deferred()
  const statuses: string[] = []
  const runs: string[][] = []
  const proof = jest.fn(async () => true)
  let cancelled = false
  const session = createWatchSession({
    discover: async () => ({
      entryIds: ['one', 'two'],
      discoveryRevision: 'same',
    }),
    canSkipUnchangedRun: proof,
    async run({ selection, signal }) {
      runs.push([...selection.entryIds])
      if (cancelled) {
        entered.resolve()
        await cleanup.promise
        expect(signal.aborted).toBe(false)
        return {
          status: 'cancelled' as const,
          closedUserCancellation: true as const,
        }
      }
      return { status: 'passed' as const }
    },
    onRunSettled(status) {
      statuses.push(status)
    },
    onError(error) {
      throw error
    },
  })
  try {
    await session.waitForIdle()
    cancelled = true
    session.invalidate({ invalidateAll: true })
    await entered.promise
    expect(statuses).toEqual(['passed'])
    cleanup.resolve()
    await session.waitForIdle()
    expect(statuses).toEqual(['passed', 'cancelled'])
    cancelled = false
    session.invalidate({ registryPaths: ['/project/one.test.mjs'] })
    await session.waitForIdle()
    expect(proof).not.toHaveBeenCalled()
    expect(runs).toEqual([
      ['one', 'two'],
      ['one', 'two'],
      ['one', 'two'],
    ])
    expect(statuses).toEqual(['passed', 'cancelled', 'passed'])
  } finally {
    cleanup.resolve()
    await session.close()
  }
})

it('retains only the complete parent-closed cancellation baseline after cleanup', async () => {
  const cleanup = deferred(),
    entered = deferred()
  const runs: string[][] = []
  const errors: unknown[] = []
  const statuses: string[] = []
  const settled = jest.fn((...args: unknown[]) =>
    statuses.push(String(args[0]))
  )
  const session = createWatchSession({
    discover: async () => ({
      entryIds: ['node', 'rsc'],
      discoveryRevision: 'config-1',
    }),
    async run({ selection }) {
      runs.push([...selection.entryIds])
      if (runs.length === 1) {
        entered.resolve()
        await cleanup.promise
        return {
          status: 'cancelled' as const,
          closedUserCancellation: true as const,
          retainBaselineOnClosedCancellation: true as const,
        }
      }
      return { status: 'passed' as const }
    },
    onRunSettled: settled,
    onError: (error) => errors.push(error),
  })
  try {
    await entered.promise
    expect(statuses).toEqual([])
    cleanup.resolve()
    await session.waitForIdle()
    expect(statuses).toEqual(['cancelled'])
    session.invalidate(complete(['rsc']))
    await session.waitForIdle()
    expect(runs).toEqual([['node', 'rsc'], ['rsc']])
    expect(settled.mock.calls).toEqual([
      [
        'cancelled',
        { entryIds: ['node', 'rsc'], discoveryRevision: 'config-1' },
        { retainBaselineOnClosedCancellation: true },
      ],
      ['passed', { entryIds: ['node', 'rsc'], discoveryRevision: 'config-1' }],
    ])
    expect(errors).toEqual([])
  } finally {
    cleanup.resolve()
    await session.close()
  }
})

it('does not publish a retained cancellation context from a superseded run', async () => {
  const entered = deferred(),
    cleanup = deferred()
  const runs: string[][] = []
  const settled = jest.fn()
  const errors: unknown[] = []
  const session = createWatchSession({
    discover: async () => ({
      entryIds: ['node', 'rsc'],
      discoveryRevision: 'config-1',
    }),
    async run({ selection }) {
      runs.push([...selection.entryIds])
      if (runs.length === 1) {
        entered.resolve()
        await cleanup.promise
        return {
          status: 'cancelled' as const,
          closedUserCancellation: true as const,
          retainBaselineOnClosedCancellation: true as const,
        }
      }
      return { status: 'passed' as const }
    },
    onRunSettled: settled,
    onError: (error) => errors.push(error),
  })
  try {
    await entered.promise
    session.invalidate(complete(['rsc']))
    expect(settled).not.toHaveBeenCalled()
    cleanup.resolve()
    await session.waitForIdle()
    expect(runs).toEqual([
      ['node', 'rsc'],
      ['node', 'rsc'],
    ])
    expect(settled.mock.calls).toEqual([
      ['passed', { entryIds: ['node', 'rsc'], discoveryRevision: 'config-1' }],
    ])
    expect(errors).toEqual([])
  } finally {
    cleanup.resolve()
    await session.close()
  }
})

it.each([
  { status: 'cancelled' as const },
  { status: 'failed' as const, closedUserCancellation: true as const },
  { status: 'passed' as const, closedUserCancellation: true as const },
])(
  'rejects an unclosed or noncancelled retained baseline: %p',
  async (result) => {
    const runs: string[][] = []
    const errors: unknown[] = []
    const session = createWatchSession({
      discover: async () => ({
        entryIds: ['node', 'rsc'],
        discoveryRevision: 'config-1',
      }),
      async run({ selection }) {
        runs.push([...selection.entryIds])
        return runs.length === 1
          ? { ...result, retainBaselineOnClosedCancellation: true as const }
          : { status: 'passed' as const }
      },
      onError: (error) => errors.push(error),
    })
    try {
      await session.waitForIdle()
      expect(errors).toHaveLength(1)
      session.invalidate(complete(['rsc']))
      await session.waitForIdle()
      expect(runs).toEqual([
        ['node', 'rsc'],
        ['node', 'rsc'],
      ])
    } finally {
      await session.close()
    }
  }
)

it('awaits readiness while retaining coalesced filesystem changes for the next owned run', async () => {
  const entered = deferred(),
    release = deferred()
  const runs: WatchRun<WatchDiscovery>[] = []
  const errors: unknown[] = []
  let readiness = 0
  const session = createWatchSession({
    discover: async () => ({ entryIds: ['node'], discoveryRevision: 'config' }),
    run: async (input) => {
      runs.push(input)
      return { status: 'passed' }
    },
    async onRunSettled() {
      if (++readiness === 1) {
        entered.resolve()
        await release.promise
      }
    },
    onError: (error) => errors.push(error),
  })
  try {
    await entered.promise
    const paths = ['/project/first.mjs']
    session.invalidate({ registryPaths: paths })
    paths[0] = '/project/foreign.mjs'
    session.invalidate({
      registryPaths: ['/project/second.mjs', '/project/first.mjs'],
    })
    expect(runs).toHaveLength(1)
    release.resolve()
    await session.waitForIdle()
    expect(runs).toHaveLength(2)
    expect(runs[0].changedPaths).toBeUndefined()
    expect(runs[1].changedPaths).toEqual([
      '/project/first.mjs',
      '/project/second.mjs',
    ])
    expect(runs[0].signal.aborted).toBe(false)
    expect(errors).toEqual([])
  } finally {
    release.resolve()
    await session.close()
  }
})

describe('settled custom watcher test removal policy', () => {
  const first = '/project/first.test.mjs',
    second = '/project/second.test.mjs'
  const baseline: WatchRegistrySnapshot = {
    configurationRevision: 'config',
    inputs: [{ file: '/project/setup.mjs', sourceHash: 'setup' }],
    entries: [
      { id: 'first', file: first, sourceHash: 'first' },
      { id: 'second', file: second, sourceHash: 'second' },
    ],
  }
  const removed = () => ({
    ...structuredClone(baseline),
    entries: [structuredClone(baseline.entries[0])],
  })
  it.each<
    [
      string,
      (registry: WatchRegistrySnapshot) => {
        current: WatchRegistrySnapshot
        changedPaths: string[] | undefined
      },
    ]
  >([
    [
      'unknown paths',
      (r: WatchRegistrySnapshot) => ({ current: r, changedPaths: undefined }),
    ],
    [
      'mixed source edit',
      (r: WatchRegistrySnapshot) => ({
        current: r,
        changedPaths: [second, '/project/helper.mjs'],
      }),
    ],
    [
      'changed remaining source',
      (r: WatchRegistrySnapshot) => {
        r.entries[0].sourceHash = 'changed'
        return { current: r, changedPaths: [second] }
      },
    ],
    [
      'changed setup',
      (r: WatchRegistrySnapshot) => {
        r.inputs[0].sourceHash = 'changed'
        return { current: r, changedPaths: [second] }
      },
    ],
    [
      'changed configuration',
      (r: WatchRegistrySnapshot) => {
        r.configurationRevision = 'new'
        return { current: r, changedPaths: [second] }
      },
    ],
    [
      'retained same physical file',
      (r: WatchRegistrySnapshot) => {
        r.entries[0].file = second
        return { current: r, changedPaths: [second] }
      },
    ],
  ])('retains ordinary execution for %s', (_name, change) => {
    expect(
      selectRegistryRemovals({ previous: baseline, ...change(removed()) })
    ).toBeUndefined()
  })
  it('joins removal-only publication and commits its baseline without execution or readiness', async () => {
    let registry = structuredClone(baseline),
      readiness = 0
    const runs: WatchRun<WatchDiscovery>[] = [],
      removedFiles: string[][] = [],
      errors: unknown[] = []
    const entered = deferred(),
      release = deferred()
    const session = createWatchSession({
      discover: async () => ({
        entryIds: registry.entries.map((entry) => entry.id),
        discoveryRevision: JSON.stringify(registry.entries),
        registry,
      }),
      run: async (input) => {
        runs.push(input)
        return { status: 'passed' }
      },
      async onRegistryRemoved({ files }) {
        removedFiles.push([...files])
        entered.resolve()
        await release.promise
        return true
      },
      onRunSettled() {
        readiness++
      },
      onError: (error) => errors.push(error),
      runEmpty: true,
    })
    try {
      await session.waitForIdle()
      registry = removed()
      session.invalidate({ registryPaths: [second] })
      await entered.promise
      expect(runs).toHaveLength(1)
      expect(readiness).toBe(1)
      release.resolve()
      await session.waitForIdle()
      expect(removedFiles).toEqual([[second]])
      expect(runs).toHaveLength(1)
      expect(readiness).toBe(1)
      registry.entries.push({
        id: 'third',
        file: '/project/third.test.mjs',
        sourceHash: 'third',
      })
      session.invalidate({ registryPaths: ['/project/third.test.mjs'] })
      await session.waitForIdle()
      expect(runs[1].selection.entryIds).toEqual(['third'])
      expect(readiness).toBe(2)
      expect(errors).toEqual([])
    } finally {
      release.resolve()
      await session.close()
    }
  })
  it('preserves normal removal execution when no observer accepts the current discovery', async () => {
    let registry = structuredClone(baseline)
    const runs: WatchRun<WatchDiscovery>[] = []
    const session = createWatchSession({
      discover: async () => ({
        entryIds: registry.entries.map((entry) => entry.id),
        discoveryRevision: JSON.stringify(registry.entries),
        registry,
      }),
      run: async (input) => {
        runs.push(input)
        return { status: 'passed' }
      },
      onRegistryRemoved: async () => false,
      onError: (error) => {
        throw error
      },
    })
    try {
      await session.waitForIdle()
      registry = removed()
      session.invalidate({ registryPaths: [second] })
      await session.waitForIdle()
      expect(runs).toHaveLength(2)
      expect(runs[1].selection.entryIds).toEqual(['first'])
    } finally {
      await session.close()
    }
  })
})

it('ignores a delayed native event for an identical regular-file baseline', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'next-testing-watch-delayed-'))
  const file = path.join(root, 'source.ts')
  const barrier = path.join(root, 'barrier.ts')
  await writeFile(file, 'before')
  class Subscription extends EventEmitter {
    close() {
      queueMicrotask(() => this.emit('close'))
    }
  }
  const nativeWatch = jest
    .spyOn(fs, 'watch')
    .mockImplementation(() => new Subscription() as unknown as fs.FSWatcher)
  const changes: FileChange[] = []
  const errors: unknown[] = []
  const watcher = await watchTestFiles({
    directories: [root],
    outputDirectories: [],
    onChange: (change) => changes.push(change),
    onError: (error) => errors.push(error),
  })
  const notify = Reflect.get(nativeWatch.mock.calls[0], 2) as (
    event: string,
    filename: string
  ) => void
  try {
    // The actual file was captured before the delayed native callback arrives.
    notify('change', 'source.ts')
    await writeFile(barrier, 'actual post-baseline input')
    notify('rename', 'barrier.ts')
    await retry(async () => {
      expect(changes.flatMap((change) => change.changed)).toEqual([barrier])
      expect(errors).toEqual([])
    })
  } finally {
    await watcher.close()
    nativeWatch.mockRestore()
    await rm(root, { recursive: true, force: true })
  }
})

it.each(['same-size content', 'mtime', 'known deletion', 'new file'] as const)(
  'retains an actual post-baseline regular-file %s change',
  async (kind) => {
    const root = await mkdtemp(
      path.join(tmpdir(), 'next-testing-watch-regular-')
    )
    const file = path.join(root, 'source.ts')
    if (kind !== 'new file') await writeFile(file, 'before')
    class Subscription extends EventEmitter {
      close() {
        queueMicrotask(() => this.emit('close'))
      }
    }
    const nativeWatch = jest
      .spyOn(fs, 'watch')
      .mockImplementation(() => new Subscription() as unknown as fs.FSWatcher)
    const changes: FileChange[] = []
    const errors: unknown[] = []
    const watcher = await watchTestFiles({
      directories: [root],
      outputDirectories: [],
      onChange: (change) => changes.push(change),
      onError: (error) => errors.push(error),
    })
    const notify = Reflect.get(nativeWatch.mock.calls[0], 2) as (
      event: string,
      filename: string
    ) => void
    try {
      if (kind === 'known deletion') await rm(file)
      else if (kind === 'mtime') {
        const time = new Date(Date.now() + 1000)
        await fs.promises.utimes(file, time, time)
      } else await writeFile(file, kind === 'new file' ? 'new' : 'after!')
      notify('rename', 'source.ts')
      await retry(async () => {
        expect(changes.flatMap((change) => change.changed)).toEqual([file])
        expect(errors).toEqual([])
      })
    } finally {
      await watcher.close()
      nativeWatch.mockRestore()
      await rm(root, { recursive: true, force: true })
    }
  }
)

it.each(['never present', 'deleted before acquisition'] as const)(
  'ignores a delayed native event for a named path %s in the actual baseline',
  async (kind) => {
    const root = await mkdtemp(
      path.join(tmpdir(), 'next-testing-watch-absent-')
    )
    const file = path.join(root, 'old-sibling', 'source.ts')
    const barrier = path.join(root, 'barrier.ts')
    if (kind === 'deleted before acquisition') {
      await mkdir(path.dirname(file))
      await writeFile(file, 'old input before acquisition')
      await rm(path.dirname(file), { recursive: true })
    }
    class Subscription extends EventEmitter {
      close() {
        queueMicrotask(() => this.emit('close'))
      }
    }
    const nativeWatch = jest
      .spyOn(fs, 'watch')
      .mockImplementation(() => new Subscription() as unknown as fs.FSWatcher)
    const changes: FileChange[] = []
    const errors: unknown[] = []
    const tick = deferred()
    const originalTimeout = global.setTimeout
    const timeout = jest
      .spyOn(global, 'setTimeout')
      .mockImplementation((callback, delay, ...args) =>
        originalTimeout(() => {
          Reflect.apply(callback, undefined, args)
          if (delay === 20) tick.resolve()
        }, delay)
      )
    const watcher = await watchTestFiles({
      directories: [root],
      outputDirectories: [],
      onChange: (change) => changes.push(change),
      onError: (error) => errors.push(error),
    })
    const notify = Reflect.get(nativeWatch.mock.calls[0], 2) as (
      event: string,
      filename: string
    ) => void
    try {
      notify('rename', path.relative(root, file))
      notify('rename', path.relative(root, path.dirname(file)))
      await tick.promise
      expect(changes).toEqual([])
      await writeFile(barrier, 'real post-baseline creation')
      notify('rename', 'barrier.ts')
      await retry(async () => {
        expect(changes.flatMap((change) => change.changed)).toEqual([barrier])
        expect(errors).toEqual([])
      })
      changes.length = 0
      await rm(barrier)
      notify('rename', 'barrier.ts')
      await retry(async () => {
        expect(changes.flatMap((change) => change.changed)).toEqual([barrier])
        expect(errors).toEqual([])
      })
    } finally {
      await watcher.close()
      timeout.mockRestore()
      nativeWatch.mockRestore()
      await rm(root, { recursive: true, force: true })
    }
  }
)

it('retains an already reconciled known deletion when its delayed native callback arrives before publication', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'next-testing-watch-deleted-'))
  const file = path.join(root, 'known.ts')
  await writeFile(file, 'actual baseline input')
  class Subscription extends EventEmitter {
    close() {
      queueMicrotask(() => this.emit('close'))
    }
  }
  const nativeWatch = jest
    .spyOn(fs, 'watch')
    .mockImplementation(() => new Subscription() as unknown as fs.FSWatcher)
  const batches: { callback(): void; timer: ReturnType<typeof setTimeout> }[] =
    []
  const scans: typeof batches = []
  const originalTimeout = global.setTimeout
  const timeout = jest
    .spyOn(global, 'setTimeout')
    .mockImplementation((callback, delay, ...args) => {
      if (delay !== 20 && delay !== 1000)
        return originalTimeout(callback, delay, ...args)
      const timer = originalTimeout(() => {}, 60000)
      const pending = delay === 20 ? batches : scans
      pending.push({
        callback: () => Reflect.apply(callback, undefined, args),
        timer,
      })
      return timer
    })
  const changes: FileChange[] = []
  const errors: unknown[] = []
  const watcher = await watchTestFiles({
    directories: [root],
    outputDirectories: [],
    onChange: (change) => changes.push(change),
    onError: (error) => errors.push(error),
  })
  try {
    await rm(file)
    const scan = scans.shift()!
    clearTimeout(scan.timer)
    scan.callback()
    await retry(async () => expect(batches).toHaveLength(1))
    const notify = Reflect.get(nativeWatch.mock.calls[0], 2) as (
      event: string,
      filename: string
    ) => void
    notify('rename', 'known.ts')
    const batch = batches.pop()!
    clearTimeout(batch.timer)
    batch.callback()
    await retry(async () => {
      expect(changes.flatMap((change) => change.changed)).toEqual([file])
      expect(errors).toEqual([])
    })
  } finally {
    await watcher.close()
    for (const pending of [...batches, ...scans]) clearTimeout(pending.timer)
    timeout.mockRestore()
    nativeWatch.mockRestore()
    await rm(root, { recursive: true, force: true })
  }
})

async function nativeDirectorySource() {
  const root = await mkdtemp(
    path.join(tmpdir(), 'next-testing-watch-directory-')
  )
  const nested = path.join(root, 'nested')
  const leaf = path.join(nested, 'leaf')
  const file = path.join(leaf, 'subject.ts')
  await mkdir(leaf, { recursive: true })
  await writeFile(file, 'actual baseline subject')
  class Subscription extends EventEmitter {
    close() {
      queueMicrotask(() => this.emit('close'))
    }
  }
  const nativeWatch = jest
    .spyOn(fs, 'watch')
    .mockImplementation(() => new Subscription() as unknown as fs.FSWatcher)
  const batches: { callback(): void; timer: ReturnType<typeof setTimeout> }[] =
    []
  const scans: typeof batches = []
  const originalTimeout = global.setTimeout
  const timeout = jest
    .spyOn(global, 'setTimeout')
    .mockImplementation((callback, delay, ...args) => {
      if (delay !== 20 && delay !== 1000)
        return originalTimeout(callback, delay, ...args)
      const timer = originalTimeout(() => {}, 60000)
      const pending = delay === 20 ? batches : scans
      pending.push({
        callback: () => Reflect.apply(callback, undefined, args),
        timer,
      })
      return timer
    })
  const changes: FileChange[] = []
  const errors: unknown[] = []
  const options = {
    directories: [root],
    outputDirectories: [],
    onChange: (change: FileChange) => changes.push(change),
    onError: (error: unknown) => errors.push(error),
  }
  const watcher = await watchTestFiles(options)
  const notify = Reflect.get(nativeWatch.mock.calls[0], 2) as (
    event: string,
    filename: string | null
  ) => void
  return {
    root,
    nested,
    leaf,
    file,
    changes,
    errors,
    options,
    watcher,
    notify(filename: string | null) {
      notify('rename', filename)
    },
    async publish() {
      const before = scans.length
      const batch = batches.pop()!
      clearTimeout(batch.timer)
      batch.callback()
      await retry(async () => expect(scans.length).toBeGreaterThan(before))
      // The existing reconciliation finally has scheduled its next scan. Join
      // its current microtask continuations before inspecting a quiet batch.
      await new Promise<void>(setImmediate)
      expect(errors).toEqual([])
    },
    async close() {
      await watcher.close()
      for (const pending of [...batches, ...scans]) clearTimeout(pending.timer)
      timeout.mockRestore()
      nativeWatch.mockRestore()
      await rm(root, { recursive: true, force: true })
    },
  }
}

it('suppresses only unchanged precise nested directory notifications after actual descendant reconciliation', async () => {
  const source = await nativeDirectorySource()
  try {
    source.notify('nested')
    source.notify(path.join('nested', 'leaf'))
    await source.publish()
    expect(source.changes).toEqual([])
  } finally {
    await source.close()
  }
})

it.each(['content', 'addition', 'deletion', 'rename', 'symlink'] as const)(
  'retains the original broad directory output for an actual %s below it',
  async (kind) => {
    const source = await nativeDirectorySource()
    try {
      if (kind === 'content')
        await writeFile(source.file, 'actual changed subject')
      else if (kind === 'addition')
        await writeFile(
          path.join(source.leaf, 'added.ts'),
          'actual added input'
        )
      else if (kind === 'deletion') await rm(source.file)
      else if (kind === 'rename')
        await fs.promises.rename(source.leaf, path.join(source.nested, 'moved'))
      else await symlink('subject.ts', path.join(source.leaf, 'linked.ts'))
      source.notify('nested')
      await source.publish()
      expect(source.changes).toEqual([
        { changed: [source.nested], removed: [] },
      ])
    } finally {
      await source.close()
    }
  }
)

it.each(
  (['null', 'outside root'] as const).flatMap((kind) =>
    (['before', 'after'] as const).map((order) => ({ kind, order }))
  )
)(
  'retains precise named facts with $kind uncertainty arriving $order them',
  async ({ kind, order }) => {
    const source = await nativeDirectorySource()
    try {
      const uncertain = kind === 'null' ? null : '../outside-root.ts'
      if (order === 'before') source.notify(uncertain)
      source.notify('nested')
      // Include the watched root itself: a later exact event must not erase
      // uncertainty already observed for that same native batch.
      source.notify('.')
      if (order === 'after') source.notify(uncertain)
      await source.publish()
      expect(source.changes).toEqual([
        {
          changed:
            order === 'before'
              ? [source.root, source.nested]
              : [source.nested, source.root],
          removed: [],
        },
      ])
    } finally {
      await source.close()
    }
  }
)

it('retains a precise directory event across an actual configuration revision', async () => {
  const source = await nativeDirectorySource()
  try {
    source.notify('nested')
    await source.watcher.update({
      ...source.options,
      outputFiles: [path.join(source.root, 'report.json')],
    })
    await source.publish()
    expect(source.changes).toEqual([{ changed: [source.nested], removed: [] }])
  } finally {
    await source.close()
  }
})

it('retains an already reconciled directory identity change before its precise native callback', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'next-testing-watch-deleted-'))
  const file = path.join(root, 'known')
  const retired = path.join(root, 'retired')
  await mkdir(file)
  class Subscription extends EventEmitter {
    close() {
      queueMicrotask(() => this.emit('close'))
    }
  }
  const nativeWatch = jest
    .spyOn(fs, 'watch')
    .mockImplementation(() => new Subscription() as unknown as fs.FSWatcher)
  const batches: { callback(): void; timer: ReturnType<typeof setTimeout> }[] =
    []
  const scans: typeof batches = []
  const originalTimeout = global.setTimeout
  const timeout = jest
    .spyOn(global, 'setTimeout')
    .mockImplementation((callback, delay, ...args) => {
      if (delay !== 20 && delay !== 1000)
        return originalTimeout(callback, delay, ...args)
      const timer = originalTimeout(() => {}, 60000)
      const pending = delay === 20 ? batches : scans
      pending.push({
        callback: () => Reflect.apply(callback, undefined, args),
        timer,
      })
      return timer
    })
  const changes: FileChange[] = []
  const errors: unknown[] = []
  const watcher = await watchTestFiles({
    directories: [root],
    outputDirectories: [],
    onChange: (change) => changes.push(change),
    onError: (error) => errors.push(error),
  })
  try {
    await fs.promises.rename(file, retired)
    await mkdir(file)
    const scan = scans.shift()!
    clearTimeout(scan.timer)
    scan.callback()
    await retry(async () => expect(scans).toHaveLength(1))
    const notify = Reflect.get(nativeWatch.mock.calls[0], 2) as (
      event: string,
      filename: string
    ) => void
    notify('rename', 'known')
    const batch = batches.pop()!
    clearTimeout(batch.timer)
    batch.callback()
    await retry(async () => {
      expect(new Set(changes.flatMap((change) => change.changed))).toEqual(
        new Set([file, retired])
      )
      expect(errors).toEqual([])
    })
  } finally {
    await watcher.close()
    for (const pending of [...batches, ...scans]) clearTimeout(pending.timer)
    timeout.mockRestore()
    nativeWatch.mockRestore()
    await rm(root, { recursive: true, force: true })
  }
})

it.each(['development', 'production'] as const)(
  'excludes the actual public invocation lock from %s watch inputs',
  async (mode) => {
    const result = await promisify(execFile)(
      process.execPath,
      [
        path.join(__dirname, 'watch-owned-lock.cjs'),
        require.resolve('next/dist/experimental/testing/watch-process'),
        require.resolve(
          'next/dist/experimental/testing/incremental/watch-files'
        ),
        require.resolve('next/dist/experimental/testing/scheduling'),
        mode,
      ],
      { env: { ...process.env, NODE_ENV: mode }, timeout: 25000 }
    )
    expect(result.stderr).toMatch(
      /^(?:\(node:\d+\) \[DEP0205\] DeprecationWarning: `module\.register\(\)` is deprecated\. Use `module\.registerHooks\(\)` instead\.\n\(Use `node --trace-deprecation \.\.\.` to show where the warning was created\)\n)?$/
    )
    expect(JSON.parse(result.stdout)).toEqual({
      mode,
      actualLockOutputExcluded: true,
      sourceObserved: true,
      closed: true,
    })
  },
  30000
)

it('reconciles a real edit in the pre-observation to subscription gap without native delivery', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'next-testing-watch-gap-'))
  const file = path.join(root, 'gap.test.ts')
  const changes: FileChange[] = []
  const errors: unknown[] = []
  class Subscription extends EventEmitter {
    closed = false
    close() {
      queueMicrotask(() => {
        this.closed = true
        this.emit('close')
      })
    }
  }
  const subscriptions: Subscription[] = []
  const nativeWatch = jest.spyOn(fs, 'watch').mockImplementation(() => {
    if (subscriptions.length === 0)
      fs.writeFileSync(file, 'created between observation and subscription')
    const subscription = new Subscription()
    subscriptions.push(subscription)
    return subscription as unknown as fs.FSWatcher
  })
  let watcher: Awaited<ReturnType<typeof watchTestFiles>> | undefined
  try {
    watcher = await watchTestFiles({
      directories: [root],
      outputDirectories: [],
      onChange: (change) => changes.push(change),
      onError: (error) => errors.push(error),
    })
    await retry(async () => {
      expect(changes.flatMap((change) => change.changed)).toEqual([file])
      expect(errors).toEqual([])
    })
  } finally {
    await watcher?.close()
    nativeWatch.mockRestore()
    await rm(root, { recursive: true, force: true })
  }
  expect(subscriptions).toHaveLength(2)
  expect(subscriptions.every((subscription) => subscription.closed)).toBe(true)
})

it('uses the prior opening observation for delayed exact files while preserving the actual subscription-gap edit', async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'next-testing-watch-observed-')
  )
  const known = ['next.config.mjs', 'next.test.config.json']
  for (const file of known) await writeFile(path.join(root, file), '{}')
  const actual = path.join(root, 'actual.test.ts')
  const changes: FileChange[] = []
  const errors: unknown[] = []
  class Subscription extends EventEmitter {
    close() {
      queueMicrotask(() => this.emit('close'))
    }
  }
  let acquired = false
  const nativeWatch = jest.spyOn(fs, 'watch').mockImplementation((...args) => {
    if (!acquired) {
      acquired = true
      const callback = Reflect.get(args, 2) as (
        event: string,
        filename: string | null
      ) => void
      // Exact old notifications have the same prior observed signature. The
      // absent path is an actual absent observation, without an output heuristic.
      for (const file of [...known, 'completed/cache/entry.js'])
        callback('rename', file)
      fs.writeFileSync(
        actual,
        'a real edit after the prior complete observation'
      )
      callback('rename', 'actual.test.ts')
    }
    return new Subscription() as unknown as fs.FSWatcher
  })
  let watcher: Awaited<ReturnType<typeof watchTestFiles>> | undefined
  try {
    watcher = await watchTestFiles({
      directories: [root],
      outputDirectories: [],
      onChange: (change) => changes.push(change),
      onError: (error) => errors.push(error),
    })
    await retry(async () => {
      expect(changes.flatMap((change) => change.changed)).toEqual([actual])
      expect(errors).toEqual([])
    })
  } finally {
    await watcher?.close()
    nativeWatch.mockRestore()
    await rm(root, { recursive: true, force: true })
  }
})

it('retains an unknown startup native scope even when its complete opening observations match', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'next-testing-watch-unknown-'))
  await writeFile(path.join(root, 'source.ts'), 'unchanged')
  const changes: FileChange[] = []
  const errors: unknown[] = []
  class Subscription extends EventEmitter {
    close() {
      queueMicrotask(() => this.emit('close'))
    }
  }
  let acquired = false
  const nativeWatch = jest.spyOn(fs, 'watch').mockImplementation((...args) => {
    if (!acquired) {
      acquired = true
      const callback = Reflect.get(args, 2) as (
        event: string,
        filename: string | null
      ) => void
      callback('rename', null)
    }
    return new Subscription() as unknown as fs.FSWatcher
  })
  let watcher: Awaited<ReturnType<typeof watchTestFiles>> | undefined
  try {
    watcher = await watchTestFiles({
      directories: [root],
      outputDirectories: [],
      onChange: (change) => changes.push(change),
      onError: (error) => errors.push(error),
    })
    await retry(async () => {
      expect(changes.flatMap((change) => change.changed)).toEqual([root])
      expect(errors).toEqual([])
    })
  } finally {
    await watcher?.close()
    nativeWatch.mockRestore()
    await rm(root, { recursive: true, force: true })
  }
})

it('owns a failed pre-subscription observation without acquiring native subscriptions', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'next-testing-watch-before-'))
  const failure = new Error('opening observation failed')
  const errors: unknown[] = []
  const stat = jest.spyOn(fs.promises, 'stat').mockRejectedValueOnce(failure)
  const nativeWatch = jest.spyOn(fs, 'watch')
  try {
    await expect(
      watchTestFiles({
        directories: [root],
        outputDirectories: [],
        onChange: jest.fn(),
        onError: (error) => errors.push(error),
      })
    ).rejects.toBe(failure)
    expect(errors).toEqual([failure])
    expect(nativeWatch).not.toHaveBeenCalled()
  } finally {
    stat.mockRestore()
    nativeWatch.mockRestore()
    await rm(root, { recursive: true, force: true })
  }
})
