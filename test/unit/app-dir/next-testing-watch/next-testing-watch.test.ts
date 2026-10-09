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
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
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
    h.setDiscovery({ entryIds: ['node', 'rsc'], discoveryRevision: 'config-2' })
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
