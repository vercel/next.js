let initCount = 0

// Exercise asynchronous module exports and initialization through the generic bootstrap.
await Promise.resolve()

export async function init() {
  await Promise.resolve()
  initCount++
}

export default function evaluate(_ipc, arg) {
  return {
    entry: 'first',
    arg,
    initCount,
    pid: process.pid,
    cwd: process.cwd(),
    hasGlobals: !!process.turbopack,
  }
}
