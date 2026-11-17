const originalSetTimeout = global.setTimeout
global.setTimeout = (callback, delay, ...args) => {
  if (delay === 10 * 60 * 1000) {
    // Advance only the process deadline, leaving debug logging's timer intact.
    return originalSetTimeout(() => {
      process.stderr.write('Ten-minute deadline reached\n')
      callback(...args)
    }, 1000)
  }
  return originalSetTimeout(callback, delay, ...args)
}

// Telemetry completes, but this handle would otherwise keep the worker alive.
setInterval(() => {}, 1000)
