const { existsSync } = require('fs')
const { dirname, join } = require('path')

// Keep the package name dynamic, including an optional candidate that isn't installed.
const platforms = process.env.PLATFORMS || ['missing', 'test']
for (const platform of platforms) {
  try {
    const packageDir = dirname(
      require.resolve(`@scope/worker-${platform}/package.json`)
    )
    const worker = join(packageDir, `worker.${platform}`)
    if (existsSync(worker)) {
      module.exports = worker
      break
    }
  } catch {}
}
