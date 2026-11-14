import loaderPid from './loader-process.pid'

function isRunning(pid) {
  try {
    // Signal 0 only checks that the process exists.
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

// Prerendered by `next build`, after the module graph has been computed.
export default function Page() {
  return <main>{isRunning(loaderPid) ? 'running' : 'stopped'}</main>
}
