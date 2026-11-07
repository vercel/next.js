const { setImmediate } = require('node:timers/promises')

// Node reports this deprecation only once per process, so cache the observation.
module.exports = (async () => {
  let deprecation = null
  function onDeprecation(warning) {
    if (warning.code === 'DEP0144') {
      deprecation = {
        name: warning.name,
        code: warning.code,
        message: warning.message,
      }
    }
  }

  process.on('warning', onDeprecation)
  process.on('uncaughtExceptionMonitor', onDeprecation)
  try {
    void module.parent
    // Node emits or throws the deprecation on the next tick.
    await setImmediate()
    return deprecation
  } finally {
    process.off('warning', onDeprecation)
    process.off('uncaughtExceptionMonitor', onDeprecation)
  }
})()
