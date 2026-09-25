const loadConfig = require('next/dist/server/config').default
const {
  resolveImageOptimizerWorker,
} = require('next/dist/server/image-optimizer/sandbox-support')

// Simulate an unsupported host without requiring a Windows test runner.
Object.defineProperty(process, 'platform', { value: 'win32' })
const requested = process.argv[2]
loadConfig('phase-test', __dirname, {
  customConfig: {
    experimental: {
      imgOptWorker: requested === 'auto' ? undefined : requested === 'true',
    },
  },
})
  .then(async (config) => {
    console.log(
      `WORKER_ENABLED=${await resolveImageOptimizerWorker(config.experimental.imgOptWorker)}`
    )
  })
  .catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
