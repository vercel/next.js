const {
  SandboxedImageOptimizerWorker,
} = require('next/dist/server/image-optimizer/sandbox-worker')

// Use the real launcher, IPC and sandbox, but replace the transform with a
// permanently blocked event loop. No production testing hooks are needed.
const original = SandboxedImageOptimizerWorker.prototype.runOperation
const spawnChild = SandboxedImageOptimizerWorker.prototype.spawnChild
SandboxedImageOptimizerWorker.prototype.spawnChild = async function () {
  const child = await spawnChild.call(this)
  console.log(`IMAGE_PROCESS_PID:${child.pid}`)
  return child
}
SandboxedImageOptimizerWorker.prototype.runOperation = function (operation) {
  this.workerPath = require.resolve('./stuck-worker.js')
  console.log(`IMAGE_SERVER_PID:${process.pid}`)
  return original.call(this, operation)
}

module.exports = {
  experimental: { imgOptWorker: true },
  images: { dangerouslyAllowSVG: true },
}
