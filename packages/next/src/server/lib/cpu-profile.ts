const privateCpuProfileName = process.env.__NEXT_PRIVATE_CPU_PROFILE
const isCpuProfileEnabled = process.env.NEXT_CPU_PROF || privateCpuProfileName
const cpuProfileDir = process.env.NEXT_CPU_PROF_DIR

if (isCpuProfileEnabled) {
  const { Session } = require('inspector') as typeof import('inspector')
  const fs = require('fs') as typeof import('fs')
  const path = require('path') as typeof import('path')

  const session = new Session()
  session.connect()

  session.post('Profiler.enable')
  session.post('Profiler.start')

  let profileSaved = false

  function saveProfile() {
    if (profileSaved) return
    profileSaved = true

    session.post('Profiler.stop', (error, param) => {
      if (error) {
        console.error('Cannot generate CPU profiling:', error)
        return
      }

      // Write profile to disk
      const filename = `${
        privateCpuProfileName || 'CPU'
      }.${process.pid}.${Date.now()}.cpuprofile`
      const outputPath = cpuProfileDir
        ? path.join(cpuProfileDir, filename)
        : `./${filename}`

      // Ensure output directory exists
      if (cpuProfileDir) {
        fs.mkdirSync(cpuProfileDir, { recursive: true })
      }

      fs.writeFileSync(outputPath, JSON.stringify(param.profile))
    })
  }

  process.on('SIGINT', saveProfile)
  process.on('SIGTERM', saveProfile)
  process.on('beforeExit', saveProfile)
}
