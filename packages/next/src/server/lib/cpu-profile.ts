const privateCpuProfileName = process.env.__NEXT_PRIVATE_CPU_PROFILE
const isCpuProfileEnabled = process.env.NEXT_CPU_PROF || privateCpuProfileName

if (isCpuProfileEnabled) {
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
        privateCpuProfileName || 'CPU.main'
      }.${Date.now()}.cpuprofile`
      fs.writeFileSync(`./${filename}`, JSON.stringify(param.profile))
      process.exit(0)
    })
  }
  process.on('SIGINT', saveProfile)
  process.on('SIGTERM', saveProfile)
  process.on('exit', saveProfile)
}
