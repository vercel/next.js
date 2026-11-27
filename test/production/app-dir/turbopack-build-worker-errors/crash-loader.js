// Simulates the Turbopack build worker dying in the middle of the compilation
// (e.g. killed by the OS when it runs out of memory). This loader runs in a
// Node.js process started by Turbopack in the build worker, so its parent is
// the build worker.
module.exports = function crashLoader() {
  const buildWorkerPid = process.ppid
  process.kill(buildWorkerPid, 'SIGKILL')
  // Don't complete the transform: the build must fail because the build
  // worker is gone, not because of this loader. Once this process is
  // reparented (the build worker is gone), exit instead of staying around as
  // an orphan.
  const interval = setInterval(() => {
    if (process.ppid !== buildWorkerPid) {
      process.exit(1)
    }
  }, 10)
  setTimeout(() => {
    clearInterval(interval)
    process.exit(1)
  }, 10_000).unref()
  return new Promise(() => {})
}
