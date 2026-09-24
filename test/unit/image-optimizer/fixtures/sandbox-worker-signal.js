const {
  SandboxedImageOptimizerWorker,
} = require('next/dist/server/image-optimizer/sandbox-worker')

new SandboxedImageOptimizerWorker()
process.kill(process.pid, process.argv[2])
// The worker's cleanup handler must not swallow default signal termination.
setInterval(() => {}, 1000)
