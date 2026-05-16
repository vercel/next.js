// Whether the diagnose-mode dump has already run. We allow further crashes in
// the same tick to be appended (so we don't lose siblings of the first one),
// but we only run the full dump once.
let diagnoseMainDumpDone = false
// Cap how many follow-on crashes we'll log before forcibly exiting, just in
// case a binding is in a runaway "throw every microtask" state.
const MAX_FOLLOW_ON_CRASHES = 4
let followOnCount = 0
// Once we schedule the exit, hold the ref so we don't double-schedule.
let exitScheduled = false

function diagnoseEnabled(): boolean {
  return process.env.NEXT_DIAGNOSE_CRASH === '1'
}

interface LibuvHandle {
  type?: string
  is_active?: boolean
  is_referenced?: boolean
}

interface NodeReport {
  sharedObjects?: unknown[]
  libuv?: LibuvHandle[]
  workers?: unknown[]
}

function getReport(): NodeReport | null {
  try {
    return (process as any).report?.getReport?.() ?? null
  } catch {
    return null
  }
}

function dumpNativeModules(report: NodeReport): void {
  // `sharedObjects` is the list of every shared library loaded by the process
  // — every `.node` binding registered via dlopen. Filtering to node_modules
  // strips out system libs (libSystem, libstdc++, …) so what's left is the
  // set of user-installed native modules, i.e. the most likely culprits when
  // an N-API callback misbehaves.
  const nativeModules = (report.sharedObjects ?? []).filter(
    (p): p is string => typeof p === 'string' && p.includes('node_modules')
  )
  if (nativeModules.length > 0) {
    console.error(
      `[next] native modules loaded from node_modules (${nativeModules.length}):`
    )
    for (const m of nativeModules) {
      console.error(`  ${m}`)
    }
  } else {
    console.error('[next] no native modules from node_modules are loaded.')
  }
}

function dumpLibuvHandles(report: NodeReport): void {
  // Active libuv handles tell us what async work is in flight at the moment
  // of the crash. We summarize by (type, active, referenced) so the output
  // stays grep-able in a CI log. A non-trivial count of `async` or `work`
  // handles, especially `is_referenced: true`, points at a binding that has
  // queued thread-pool work that may have triggered the throw.
  const handles = report.libuv ?? []
  if (handles.length === 0) {
    console.error('[next] no libuv handles reported.')
    return
  }
  type Key = string
  const counts = new Map<Key, number>()
  for (const h of handles) {
    if (!h || typeof h !== 'object') continue
    // Skip the trivial process-level handles that are always present.
    if (h.type === 'tty' || h.type === 'signal') continue
    const active = h.is_active ? 'active' : 'inactive'
    const refed = h.is_referenced ? 'refed' : 'unrefed'
    const key = `${h.type ?? 'unknown'} (${active}, ${refed})`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  if (counts.size === 0) {
    console.error('[next] no non-trivial libuv handles in flight.')
    return
  }
  console.error('[next] libuv handles in flight at time of crash:')
  for (const [key, count] of counts) {
    console.error(`  ${count}x ${key}`)
  }
}

function dumpWorkers(report: NodeReport): void {
  const workers = report.workers ?? []
  if (workers.length === 0) return
  console.error(
    `[next] ${workers.length} worker thread(s) alive at time of crash.`
  )
}

function dumpErrorCause(err: unknown): void {
  // Some N-API bindings (notably napi-rs) set `cause` to wrap a deeper native
  // error. The default Node printer doesn't follow it, so we walk it here.
  let cur: unknown = err
  let depth = 0
  while (
    cur &&
    typeof cur === 'object' &&
    'cause' in cur &&
    (cur as { cause: unknown }).cause &&
    depth < 5
  ) {
    cur = (cur as { cause: unknown }).cause
    depth += 1
    console.error(`[next] error.cause (depth ${depth}):`, cur)
  }
}

function writeDiagnosticReportToDisk(): string | null {
  try {
    // Full report on disk is a fallback — only useful when running locally
    // where the user can grab the file. On Vercel / hosted CI, the inline
    // dumps above are what actually reach the customer.
    return (process as any).report?.writeReport?.() ?? null
  } catch {
    return null
  }
}

function logDiagnostics(kind: string, err: unknown): void {
  if (diagnoseMainDumpDone) {
    followOnCount += 1
    if (followOnCount > MAX_FOLLOW_ON_CRASHES) return
    console.error(`${kind} (additional)`, err)
    return
  }
  diagnoseMainDumpDone = true

  console.error(kind, err)
  dumpErrorCause(err)

  console.error(
    '\n[next] NEXT_DIAGNOSE_CRASH is set — collecting additional context.'
  )

  const report = getReport()
  if (report) {
    dumpNativeModules(report)
    dumpLibuvHandles(report)
    dumpWorkers(report)
  } else {
    console.error('[next] process.report is unavailable in this Node version.')
  }

  const reportPath = writeDiagnosticReportToDisk()
  if (reportPath) {
    console.error(
      `[next] full Node diagnostic report also written to ${reportPath} (local builds only).`
    )
  }
}

function scheduleExit(code: number): void {
  if (exitScheduled) return
  exitScheduled = true
  if (!diagnoseEnabled()) {
    process.exit(code)
    return
  }
  // Defer by one tick so that any *other* uncaughtExceptions queued for the
  // same tick still reach the handler. setImmediate runs after I/O callbacks
  // for this tick.
  setImmediate(() => process.exit(code))
}

process.on('uncaughtException', (err) => {
  if (!diagnoseEnabled()) {
    console.error('uncaughtException', err)
    process.exit(1)
  } else {
    logDiagnostics('uncaughtException', err)
    scheduleExit(1)
  }
})

process.on('unhandledRejection', (err) => {
  if (!diagnoseEnabled()) {
    console.error('unhandledRejection', err)
    process.exit(1)
  } else {
    logDiagnostics('unhandledRejection', err)
    scheduleExit(1)
  }
})
