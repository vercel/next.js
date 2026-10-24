let initCount = 0

export function init() {
  initCount++
}

export default function evaluate(_ipc, arg) {
  return {
    entry: 'second',
    arg,
    initCount,
    pid: process.pid,
    cwd: process.cwd(),
    hasGlobals: !!process.turbopack,
  }
}
