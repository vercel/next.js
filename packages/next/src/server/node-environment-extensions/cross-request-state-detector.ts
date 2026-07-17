/**
 * DEV-ONLY cross-request state leak detector (prototype).
 *
 * Catches the class of bug that hit v0 in production: a module-scoped mutable
 * container (`const cache = new Map()` at top level) that stores a per-request
 * `Promise` and — because the container outlives a single request in a reused
 * server function instance — hands that Promise to a *different* request. When
 * the cache key is deterministic (e.g. `useId()`), request B reads request A's
 * in-flight/resolved data. See v0 incident writeup
 * `chat/app/lib/server-query-swr/state-lifetime-history.md`.
 *
 * The unwrap itself (native `await` / React `use()` on an already-settled
 * promise) is invisible at the JS layer — `await` bypasses a patched
 * `Promise.prototype.then`, and async_hooks does not expose the promise object
 * or a cross-store consume event. So instead of tagging the thenable, we tag
 * the *container entry*: when a Promise is stored under request A's store and
 * later retrieved under request B's store, we warn.
 *
 * We only ever track entries whose value is a thenable. Ordinary module-scoped
 * caches of plain data (config lookups, compiled-route tables) are never
 * tracked, which keeps false positives near zero: caching a Promise so it can
 * be shared across requests is essentially always a bug.
 *
 * The core is dependency-injected (no Next imports) so it can be exercised by a
 * standalone harness. The real extension passes `workUnitAsyncStorage`.
 */

/* eslint-disable no-extend-native -- this module deliberately instruments the
   global Map/Set/WeakMap/WeakSet prototypes to observe cross-request reuse,
   the same way date.tsx/random.tsx instrument Date and Math.random. */

/** Minimal shape we read off a work-unit store. */
export interface WorkUnitStoreLike {
  readonly type?: string
  readonly url?: { readonly pathname?: string }
}

export interface DetectorHost {
  /** The currently-active work-unit store, or undefined outside a render. */
  getStore(): WorkUnitStoreLike | undefined
  /** Emit a warning (console.error in the real extension). */
  warn(message: string): void
}

interface OwnerRecord {
  /** The request store object — compared by identity to detect crossing. */
  readonly store: object
  /** Human-readable label for the warning. */
  readonly label: string
}

type ContainerKind = 'Map' | 'WeakMap' | 'Set' | 'WeakSet'

function isThenable(v: unknown): v is PromiseLike<unknown> {
  return (
    v != null &&
    (typeof v === 'object' || typeof v === 'function') &&
    typeof (v as { then?: unknown }).then === 'function'
  )
}

export function installCrossRequestStateDetector(
  host: DetectorHost
): () => void {
  // Capture originals BEFORE patching. All internal bookkeeping goes through
  // these so the detector never re-enters its own patched methods (which would
  // recurse infinitely, since we store metadata in Maps/WeakMaps).
  const O = {
    mapGet: Map.prototype.get,
    mapSet: Map.prototype.set,
    setAdd: Set.prototype.add,
    setHas: Set.prototype.has,
    wmGet: WeakMap.prototype.get,
    wmSet: WeakMap.prototype.set,
    wsAdd: WeakSet.prototype.add,
    wsHas: WeakSet.prototype.has,
  }

  // container -> (entryKeyOrValue -> owner). For Map/WeakMap the sub-key is the
  // entry key; for Set/WeakSet the sub-key is the value itself.
  const owners = new WeakMap<
    object,
    WeakMap<object, OwnerRecord> | Map<unknown, OwnerRecord>
  >()
  // container -> set of already-warned entry keys/values (dedupe noise).
  const warned = new WeakMap<object, Set<unknown> | WeakSet<object>>()
  const requestLabels = new WeakMap<object, string>()
  let nextRequestId = 1
  let inDetector = false

  function currentRequest(): OwnerRecord | undefined {
    const store = host.getStore()
    if (!store || store.type !== 'request') return undefined
    const s = store as unknown as object
    let label = O.wmGet.call(requestLabels, s) as string | undefined
    if (label === undefined) {
      const path = store.url?.pathname ?? '?'
      label = `request#${nextRequestId++} (${path})`
      O.wmSet.call(requestLabels, s, label)
    }
    return { store: s, label }
  }

  /** Record that `subKey` in `container` now holds a request-owned promise. */
  function recordOwner(
    container: object,
    subKey: unknown,
    weak: boolean,
    req: OwnerRecord
  ): void {
    let table = O.wmGet.call(owners, container) as
      | WeakMap<object, OwnerRecord>
      | Map<unknown, OwnerRecord>
      | undefined
    if (table === undefined) {
      table = weak
        ? new WeakMap<object, OwnerRecord>()
        : new Map<unknown, OwnerRecord>()
      O.wmSet.call(owners, container, table)
    }
    if (weak) {
      O.wmSet.call(table as WeakMap<object, OwnerRecord>, subKey as object, req)
    } else {
      O.mapSet.call(table as Map<unknown, OwnerRecord>, subKey, req)
    }
  }

  /** Look up the owner previously recorded for `subKey`, if any. */
  function lookupOwner(
    container: object,
    subKey: unknown,
    weak: boolean
  ): OwnerRecord | undefined {
    const table = O.wmGet.call(owners, container) as
      | WeakMap<object, OwnerRecord>
      | Map<unknown, OwnerRecord>
      | undefined
    if (table === undefined) return undefined
    return weak
      ? (O.wmGet.call(
          table as WeakMap<object, OwnerRecord>,
          subKey as object
        ) as OwnerRecord | undefined)
      : (O.mapGet.call(table as Map<unknown, OwnerRecord>, subKey) as
          | OwnerRecord
          | undefined)
  }

  function alreadyWarned(
    container: object,
    subKey: unknown,
    weak: boolean
  ): boolean {
    let set = O.wmGet.call(warned, container) as
      | Set<unknown>
      | WeakSet<object>
      | undefined
    if (set === undefined) {
      set = weak ? new WeakSet<object>() : new Set<unknown>()
      O.wmSet.call(warned, container, set)
    }
    if (weak) {
      const ws = set as WeakSet<object>
      if (O.wsHas.call(ws, subKey as object)) return true
      O.wsAdd.call(ws, subKey as object)
      return false
    }
    const s = set as Set<unknown>
    if (O.setHas.call(s, subKey)) return true
    O.setAdd.call(s, subKey)
    return false
  }

  function report(
    kind: ContainerKind,
    ownerLabel: string,
    readerLabel: string,
    subKey: unknown
  ): void {
    const keyDesc =
      kind === 'Set' || kind === 'WeakSet'
        ? ''
        : `\n  Entry key: ${describeKey(subKey)}`
    host.warn(
      `Cross-request state leak detected.\n` +
        `  A Promise stored in a module-scoped \`${kind}\` during ${ownerLabel}\n` +
        `  was just read during ${readerLabel}.\n` +
        `  Because the container outlives a single request, one user's in-flight or\n` +
        `  resolved data can be served to another user.` +
        keyDesc +
        `\n  Fix: don't keep per-request Promises in module scope. Use \`React.cache()\`\n` +
        `  for per-request dedupe, or own the state in a React provider created per render.`
    )
  }

  function describeKey(k: unknown): string {
    if (typeof k === 'string') return JSON.stringify(k)
    if (typeof k === 'number' || typeof k === 'boolean' || k == null)
      return String(k)
    return Object.prototype.toString.call(k)
  }

  // ---- patches -----------------------------------------------------------

  Map.prototype.set = function set(this: Map<unknown, unknown>, key, value) {
    const result = O.mapSet.call(this, key, value)
    if (!inDetector && isThenable(value)) {
      inDetector = true
      try {
        const req = currentRequest()
        if (req) recordOwner(this, key, false, req)
      } catch {
      } finally {
        inDetector = false
      }
    }
    return result as Map<unknown, unknown>
  }

  Map.prototype.get = function get(this: Map<unknown, unknown>, key) {
    const value = O.mapGet.call(this, key)
    if (!inDetector && isThenable(value)) {
      inDetector = true
      try {
        const req = currentRequest()
        const owner = lookupOwner(this, key, false)
        if (
          req &&
          owner &&
          owner.store !== req.store &&
          !alreadyWarned(this, key, false)
        ) {
          report('Map', owner.label, req.label, key)
        }
      } catch {
      } finally {
        inDetector = false
      }
    }
    return value
  }

  WeakMap.prototype.set = function set(
    this: WeakMap<object, unknown>,
    key,
    value
  ) {
    const result = O.wmSet.call(this, key, value)
    if (!inDetector && isThenable(value)) {
      inDetector = true
      try {
        const req = currentRequest()
        if (req) recordOwner(this, key, false, req)
      } catch {
      } finally {
        inDetector = false
      }
    }
    return result as WeakMap<object, unknown>
  }

  WeakMap.prototype.get = function get(this: WeakMap<object, unknown>, key) {
    const value = O.wmGet.call(this, key)
    if (!inDetector && isThenable(value)) {
      inDetector = true
      try {
        const req = currentRequest()
        const owner = lookupOwner(this, key, false)
        if (
          req &&
          owner &&
          owner.store !== req.store &&
          !alreadyWarned(this, key, false)
        ) {
          report('WeakMap', owner.label, req.label, key)
        }
      } catch {
      } finally {
        inDetector = false
      }
    }
    return value
  }

  Set.prototype.add = function add(this: Set<unknown>, value) {
    const result = O.setAdd.call(this, value)
    if (!inDetector && isThenable(value)) {
      inDetector = true
      try {
        const req = currentRequest()
        if (req) recordOwner(this, value, true, req)
      } catch {
      } finally {
        inDetector = false
      }
    }
    return result as Set<unknown>
  }

  Set.prototype.has = function has(this: Set<unknown>, value) {
    const present = O.setHas.call(this, value)
    if (!inDetector && present && isThenable(value)) {
      inDetector = true
      try {
        const req = currentRequest()
        const owner = lookupOwner(this, value, true)
        if (
          req &&
          owner &&
          owner.store !== req.store &&
          !alreadyWarned(this, value, true)
        ) {
          report('Set', owner.label, req.label, value)
        }
      } catch {
      } finally {
        inDetector = false
      }
    }
    return present
  }

  WeakSet.prototype.add = function add(this: WeakSet<object>, value) {
    const result = O.wsAdd.call(this, value)
    if (!inDetector && isThenable(value)) {
      inDetector = true
      try {
        const req = currentRequest()
        if (req) recordOwner(this, value, true, req)
      } catch {
      } finally {
        inDetector = false
      }
    }
    return result as WeakSet<object>
  }

  WeakSet.prototype.has = function has(this: WeakSet<object>, value) {
    const present = O.wsHas.call(this, value)
    if (!inDetector && present && isThenable(value)) {
      inDetector = true
      try {
        const req = currentRequest()
        const owner = lookupOwner(this, value, true)
        if (
          req &&
          owner &&
          owner.store !== req.store &&
          !alreadyWarned(this, value, true)
        ) {
          report('WeakSet', owner.label, req.label, value)
        }
      } catch {
      } finally {
        inDetector = false
      }
    }
    return present
  }

  // uninstall (for tests)
  return function uninstall() {
    Map.prototype.get = O.mapGet
    Map.prototype.set = O.mapSet
    Set.prototype.add = O.setAdd
    Set.prototype.has = O.setHas
    WeakMap.prototype.get = O.wmGet
    WeakMap.prototype.set = O.wmSet
    WeakSet.prototype.add = O.wsAdd
    WeakSet.prototype.has = O.wsHas
  }
}
