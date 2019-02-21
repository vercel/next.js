export function onExit(fn: Function) {
  const listeners = [
    { event: 'SIGINT', handler: () => exit('SIGINT') },
    { event: 'SIGHUP', handler: () => exit('SIGHUP') },
    { event: 'SIGQUIT', handler: () => exit('SIGQUIT') },
    { event: 'SIGTERM', handler: () => exit('SIGTERM') },

    {
      event: 'uncaughtException',
      handler: () => {
        exit()
        process.exit(1)
      },
    },
    { event: 'exit', handler: () => exit() },
  ]

  function exit(signal: string = '') {
    try {
      if (listeners.length) {
        fn()
      }
    } finally {
      while (listeners.length) {
        const [{ event, handler }] = listeners.splice(0, 1)
        process.removeListener(event, handler)
      }

      if (signal) {
        process.kill(process.pid, signal)
      }
    }
  }

  for (const { event, handler } of listeners) {
    process.on(event as any, handler)
  }
}
