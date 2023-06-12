if (process.env.__NEXT_PRIVATE_CPU_PROFILE) {
  const { Session } = require('inspector') as typeof import('inspector')
  const fs = require('fs')

  const session = new Session()
  session.connect()

  session.post('Profiler.enable')
  session.post('Profiler.start')

  function saveProfile() {
    session.post('Profiler.stop', (error, param) => {
      if (error) {
        console.error('Cannot generate CPU profiling:', error)
        return
      }

      // Write profile to disk
      const filename = `${
        process.env.__NEXT_PRIVATE_CPU_PROFILE
      }.${Date.now()}.cpuprofile`
      fs.writeFileSync(`./${filename}`, JSON.stringify(param.profile))
      process.exit(0)
    })
  }
  process.on('SIGINT', saveProfile)
  process.on('SIGTERM', saveProfile)
}
