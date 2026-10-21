import path from 'path'
import { watch, statSync, lstatSync } from 'fs'
import {
  readWatchInputSnapshot,
  watchInputSignature,
} from './watch-input-snapshot'

export interface WatchDirectories {
  /** Actual project/compiler roots; include workspace inputs outside the app. */
  directories: readonly string[]
  /** Actual resolved output roots, never a guessed default distDir. */
  outputDirectories: readonly string[]
  /** Files published atomically with owned <file>.<UUID>.tmp siblings. */
  outputFiles?: readonly string[]
  /** Exact compiler configuration dependencies, including installed helpers. */
  dependencyFiles?: readonly string[]
  /** Compiler-owned temporary snapshots adjacent to the configured output. */
  artifactDirectories?: readonly {
    parentDirectory: string
    basenamePrefixes: readonly string[]
  }[]
}

export interface FileChange {
  /** Observed paths/scopes, never complete compiler dependency evidence. */
  changed: readonly string[]
  /** Native rename notifications do not distinguish addition from deletion. */
  removed: readonly string[]
}

interface Subscription {
  root: string
  stopped: Promise<void>
  stop(): void
  assertRoot(): void
}

function contains(directory: string, file: string) {
  const relative = path.relative(directory, file)
  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  )
}

/**
 * Public native watcher subscriptions: startup errors reject, asynchronous
 * subscription errors stop the source and call onError. No error is merely
 * logged while pretending the source is live. Unknown filenames invalidate
 * all roots. Cooperative input reconciliation also catches changes omitted by
 * native delivery. Neither source proves compiler dependencies or import edges.
 */
export async function watchTestFiles(
  options: WatchDirectories & {
    onChange(change: FileChange): void
    onError(error: unknown): void
  }
) {
  let directories: string[] = []
  let outputs: string[] = []
  let outputFiles: string[] = []
  let dependencyFiles = new Set<string>()
  let artifacts: NonNullable<WatchDirectories['artifactDirectories']> = []
  const subscriptions = new Map<string, Subscription>()
  const stopping = new Set<Promise<void>>()
  let closed = false
  let ready = false
  let closeWork: Promise<void> | undefined
  let notification: ReturnType<typeof setTimeout> | undefined
  let integrityCheck: ReturnType<typeof setInterval> | undefined
  const changed = new Set<string>()
  const scanController = new AbortController()
  let scanTimer: ReturnType<typeof setTimeout> | undefined
  let scanWork: Promise<void> | undefined
  let inputSnapshot: Map<string, string> | undefined
  let scanConfiguration = ''
  let scanRevision = 0
  let nativePathsDuringScan: Set<string> | undefined
  const nativeChanges = new Set<string>()
  const broadNativeScopes = new Set<string>()
  let broadNativeRevision = 0
  let notificationWork: Promise<void> | undefined

  function ignored(absolute: string) {
    return (
      outputs.some((output) => contains(output, absolute)) ||
      outputFiles.some(
        (output) =>
          absolute === output ||
          (absolute.startsWith(`${output}.`) &&
            /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.tmp$/i.test(
              absolute.slice(output.length + 1)
            ))
      ) ||
      artifacts.some(({ parentDirectory, basenamePrefixes }) => {
        if (!contains(parentDirectory, absolute)) return false
        const basename = path
          .relative(parentDirectory, absolute)
          .split(path.sep)[0]
        return basenamePrefixes.some((prefix) => basename.startsWith(prefix))
      }) ||
      directories.some((root) => {
        if (!contains(root, absolute)) return false
        const segments = path.relative(root, absolute).split(path.sep)
        return (
          segments.includes('.git') ||
          (segments.includes('node_modules') && !dependencyFiles.has(absolute))
        )
      })
    )
  }

  function stop(subscription: Subscription) {
    stopping.add(subscription.stopped)
    subscription.stop()
    void subscription.stopped.then(() => stopping.delete(subscription.stopped))
  }

  function close(): Promise<void> {
    if (closeWork) return closeWork
    closed = true
    clearTimeout(notification)
    clearInterval(integrityCheck)
    clearTimeout(scanTimer)
    scanController.abort(new Error('Test watch source closed.'))
    changed.clear()
    broadNativeScopes.clear()
    nativeChanges.clear()
    for (const subscription of subscriptions.values()) stop(subscription)
    subscriptions.clear()
    closeWork = Promise.all([
      ...stopping,
      scanWork?.catch(() => {}),
      notificationWork?.catch(() => {}),
    ]).then(() => {
      inputSnapshot?.clear()
    })
    return closeWork
  }

  function fail(error: unknown) {
    if (closed) return
    // Abort the orchestrator immediately; close() remains the awaited owner of
    // all subscription shutdown, including after an asynchronous native error.
    void close()
    options.onError(error)
  }

  function refreshNativePath(snapshot: Map<string, string>, file: string) {
    try {
      const stats = directories.includes(file)
        ? statSync(file, { bigint: true })
        : lstatSync(file, { bigint: true })
      snapshot.set(file, watchInputSignature(stats))
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code === 'ENOENT' ||
        (error as NodeJS.ErrnoException).code === 'ENOTDIR'
      ) {
        snapshot.delete(file)
      } else throw error
    }
  }

  function queueChange(file: string, broadNativeScope = false, native = false) {
    changed.add(file)
    if (native) nativeChanges.add(file)
    if (broadNativeScope) {
      broadNativeScopes.add(file)
      broadNativeRevision++
    }
    if (notificationWork) return
    clearTimeout(notification)
    notification = setTimeout(() => {
      notification = undefined
      if (closed || !ready) return
      notificationWork = (async () => {
        // A null/directory native event already invalidates its whole scope.
        // Acquire its metadata baseline before publishing, rather than letting
        // a later scan redeliver children covered by that broad invalidation.
        while (broadNativeScopes.size) {
          const revision = broadNativeRevision
          const scopes = [...broadNativeScopes]
          await scanWork
          if (closed) return
          await reconcile(scopes)
          if (closed) return
          if (revision !== broadNativeRevision) continue
          for (const observed of changed) {
            if (
              !nativeChanges.has(observed) &&
              scopes.some(
                (scope) => scope !== observed && contains(scope, observed)
              )
            )
              changed.delete(observed)
          }
          break
        }
        const paths = [...changed]
        changed.clear()
        broadNativeScopes.clear()
        nativeChanges.clear()
        // Exact native notifications retain the existing fast path. Refresh
        // their entries so periodic reconciliation does not repeat the write.
        for (const observed of paths) {
          nativePathsDuringScan?.add(observed)
          if (inputSnapshot) refreshNativePath(inputSnapshot, observed)
        }
        options.onChange({ changed: paths, removed: [] })
      })()
        .catch((error) => {
          if (!closed) fail(error)
        })
        .finally(() => {
          notificationWork = undefined
          if (!closed && changed.size)
            queueChange(changed.values().next().value!)
        })
    }, 20)
  }

  function notify(root: string, filename: string | null) {
    if (closed) return
    try {
      // Native watchers can keep watching an unlinked inode. Stop explicitly
      // rather than leave a recreated project root silently unwatched.
      subscriptions.get(root)?.assertRoot()
      const file = filename === null ? root : path.resolve(root, filename)
      if (filename !== null && contains(root, file) && ignored(file)) return
      let broad = filename === null || !contains(root, file)
      if (!broad) {
        try {
          broad = lstatSync(file).isDirectory()
        } catch (error) {
          if (
            (error as NodeJS.ErrnoException).code !== 'ENOENT' &&
            (error as NodeJS.ErrnoException).code !== 'ENOTDIR'
          )
            throw error
          broad = inputSnapshot?.get(file)?.startsWith('directory:') === true
        }
      }
      queueChange(contains(root, file) ? file : root, broad, true)
    } catch (error) {
      fail(error)
    }
  }

  function reconcile(coveredScopes: readonly string[] = []): Promise<void> {
    if (closed) return Promise.resolve()
    if (scanWork) return scanWork
    clearTimeout(scanTimer)
    const revision = scanRevision
    nativePathsDuringScan = new Set()
    scanWork = (async () => {
      for (const root of directories) subscriptions.get(root)?.assertRoot()
      const next = await readWatchInputSnapshot({
        roots: [...directories],
        signal: scanController.signal,
        files: [...dependencyFiles],
        ignored,
      })
      if (closed || revision !== scanRevision) return
      // A native batch may have published while asynchronous metadata reads
      // were outstanding. Merge those paths at their current state, rather
      // than restoring an older scan result and generating a duplicate rerun.
      for (const file of nativePathsDuringScan!) refreshNativePath(next, file)
      if (inputSnapshot) {
        for (const [file, signature] of next) {
          if (
            inputSnapshot.get(file) !== signature &&
            !coveredScopes.some((scope) => contains(scope, file))
          )
            queueChange(file)
        }
        for (const file of inputSnapshot.keys()) {
          if (
            !next.has(file) &&
            !coveredScopes.some((scope) => contains(scope, file))
          )
            queueChange(file)
        }
      }
      inputSnapshot = next
    })()
      .catch((error) => {
        if (!closed && revision === scanRevision) {
          fail(error)
          throw error
        }
      })
      .finally(() => {
        scanWork = undefined
        nativePathsDuringScan = undefined
        if (!closed)
          scanTimer = setTimeout(() => void reconcile().catch(() => {}), 1000)
      })
    return scanWork
  }

  function subscribe(root: string, guard = false): Subscription {
    const identity = statSync(root)
    if (!identity.isDirectory()) {
      throw new Error(`Test watch root is not a directory: ${root}`)
    }
    // Recursive watch is public on the supported Node version. No private
    // Watchpack handles, console interception or ignored native errors.
    const watcher = watch(
      guard ? path.dirname(root) : root,
      { recursive: !guard },
      (_event, filename) => {
        if (closed) return
        if (!guard) {
          notify(root, filename)
        } else {
          // FSEvents may not notify a watch on a directory when that directory
          // itself moves. A non-recursive parent subscription guards its inode.
          // Parent events never invalidate tests (including output-only writes).
          // Check every event: a self-rename may name the parent itself instead
          // of the child root, while both subscriptions retain the old inodes.
          try {
            subscription.assertRoot()
          } catch (error) {
            fail(error)
          }
        }
      }
    )
    let resolveStopped!: () => void
    const stopped = new Promise<void>((resolve) => {
      resolveStopped = resolve
    })
    let stopRequested = false
    watcher.once('close', () => {
      resolveStopped()
      if (!stopRequested && !closed) {
        fail(new Error(`Test watch subscription closed unexpectedly: ${root}`))
      }
    })
    watcher.on('error', (error) => {
      // Node documents an errored FSWatcher as no longer usable. Some backends
      // close it before emitting error, without a subsequent close event.
      stopRequested = true
      watcher.close()
      resolveStopped()
      fail(error)
    })
    const subscription: Subscription = {
      root,
      stopped,
      stop() {
        if (stopRequested) return
        stopRequested = true
        watcher.close()
      },
      assertRoot() {
        const current = statSync(root)
        if (current.dev !== identity.dev || current.ino !== identity.ino) {
          throw new Error(
            `Test watch root was replaced; restart watch: ${root}`
          )
        }
      },
    }
    subscriptions.set(guard ? `guard:${root}` : root, subscription)
    subscription.assertRoot()
    return subscription
  }

  async function update(next: WatchDirectories) {
    if (closed) return
    const roots = [...new Set(next.directories.map((p) => path.resolve(p)))]
    const nextDirectories = roots.filter(
      (root) => !roots.some((other) => other !== root && contains(other, root))
    )
    const nextOutputs = next.outputDirectories.map((p) => path.resolve(p))
    const nextOutputFiles = (next.outputFiles ?? []).map((p) => path.resolve(p))
    const nextArtifacts = (next.artifactDirectories ?? []).map((artifact) => ({
      parentDirectory: path.resolve(artifact.parentDirectory),
      basenamePrefixes: [...artifact.basenamePrefixes],
    }))
    try {
      if (!nextDirectories.length)
        throw new Error('Test watch requires an input root.')
      if (
        nextDirectories.some((root) =>
          nextOutputs.some((out) => contains(out, root))
        )
      ) {
        throw new Error(
          'Test watch input roots must not be inside output directories.'
        )
      }
      directories = nextDirectories
      outputs = nextOutputs
      outputFiles = nextOutputFiles
      dependencyFiles = new Set(
        (next.dependencyFiles ?? []).map((file) => path.resolve(file))
      )
      artifacts = nextArtifacts
      const nextScanConfiguration = JSON.stringify([
        directories,
        outputs,
        outputFiles,
        [...dependencyFiles],
        artifacts,
      ])
      if (nextScanConfiguration !== scanConfiguration) {
        scanConfiguration = nextScanConfiguration
        scanRevision++
        inputSnapshot = undefined
      }
      // Acquire replacements before releasing old roots: no subscription gap.
      for (const root of directories) {
        const existing = subscriptions.get(root)
        if (existing) existing.assertRoot()
        else {
          subscribe(root)
          if (path.dirname(root) !== root) subscribe(root, true)
          subscriptions.get(root)!.assertRoot()
        }
      }
      for (const [root, subscription] of subscriptions) {
        if (!directories.includes(subscription.root)) {
          subscriptions.delete(root)
          stop(subscription)
        }
      }
      await Promise.all(stopping)
      // An established baseline for this exact configuration remains valid
      // while periodic reconciliation runs. Rediscovery must not join that
      // unrelated scan; changed configurations still drain it before opening
      // their new baseline. close() retains ownership of every started read.
      if (!inputSnapshot) {
        await scanWork
        if (!closed && !inputSnapshot) await reconcile()
      }
    } catch (error) {
      await close()
      throw error
    }
  }

  await update(options)
  if (!closed) {
    // Some backends can miss a directory's own move, including immediately
    // after subscription. Independently bound the time we can retain a watch
    // on an obsolete root inode; this is not source-dependency polling.
    integrityCheck = setInterval(() => {
      try {
        for (const root of directories) subscriptions.get(root)?.assertRoot()
      } catch (error) {
        fail(error)
      }
    }, 1000)
  }
  // Deliver changes accumulated during the initial scan after the caller has
  // received this source and installed its session. No native startup edit is
  // absorbed solely into the reconciliation baseline.
  ready = true
  if (changed.size) queueChange(changed.values().next().value!)
  return { close, update }
}
