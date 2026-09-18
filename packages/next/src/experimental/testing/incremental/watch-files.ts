import path from 'path'
import { watch, statSync } from 'fs'

export interface WatchDirectories {
  /** Actual project/compiler roots; include workspace inputs outside the app. */
  directories: readonly string[]
  /** Actual resolved output roots, never a guessed default distDir. */
  outputDirectories: readonly string[]
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
 * all roots. This does not prove dependency coverage or infer import edges.
 */
export async function watchTestFiles(
  options: WatchDirectories & {
    onChange(change: FileChange): void
    onError(error: unknown): void
  }
) {
  let directories: string[] = []
  let outputs: string[] = []
  let artifacts: NonNullable<WatchDirectories['artifactDirectories']> = []
  const subscriptions = new Map<string, Subscription>()
  const stopping = new Set<Promise<void>>()
  let closed = false
  let closeWork: Promise<void> | undefined
  let notification: ReturnType<typeof setTimeout> | undefined
  let integrityCheck: ReturnType<typeof setInterval> | undefined
  const changed = new Set<string>()

  function ignored(absolute: string) {
    return (
      outputs.some((output) => contains(output, absolute)) ||
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
        return segments.includes('node_modules') || segments.includes('.git')
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
    changed.clear()
    for (const subscription of subscriptions.values()) stop(subscription)
    subscriptions.clear()
    closeWork = Promise.all(stopping).then(() => {})
    return closeWork
  }

  function fail(error: unknown) {
    if (closed) return
    // Abort the orchestrator immediately; close() remains the awaited owner of
    // all subscription shutdown, including after an asynchronous native error.
    void close()
    options.onError(error)
  }

  function notify(root: string, filename: string | null) {
    if (closed) return
    try {
      // Native watchers can keep watching an unlinked inode. Stop explicitly
      // rather than leave a recreated project root silently unwatched.
      subscriptions.get(root)?.assertRoot()
      const file = filename === null ? root : path.resolve(root, filename)
      if (filename !== null && contains(root, file) && ignored(file)) return
      changed.add(contains(root, file) ? file : root)
      clearTimeout(notification)
      notification = setTimeout(() => {
        notification = undefined
        if (closed) return
        const paths = [...changed]
        changed.clear()
        try {
          options.onChange({ changed: paths, removed: [] })
        } catch (error) {
          fail(error)
        }
      }, 20)
    } catch (error) {
      fail(error)
    }
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
      artifacts = nextArtifacts
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
  return { close, update }
}
