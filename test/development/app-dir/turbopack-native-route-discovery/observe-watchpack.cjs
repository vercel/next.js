const path = require('node:path')
const Watchpack = require('next/dist/compiled/watchpack')

const projectDir = process.cwd()
const originalWatch = Watchpack.prototype.watch

function relativePaths(paths) {
  return [...(paths || [])]
    .map((file) => {
      return path.relative(projectDir, file).replace(/\\/g, '/') || '.'
    })
    .filter((file) => {
      return (
        file === '.' ||
        /^(?:src\/)?(?:app|pages)(?:\/|$)/.test(file) ||
        /^\.env(?:\.|$)/.test(file) ||
        /^(?:tsconfig|jsconfig)\.json$/.test(file)
      )
    })
}

// Observe the work requested from Watchpack, including startup and rewatching.
// Log from the preload so this also sees any Node child processes.
Watchpack.prototype.watch = function watch(options, ...args) {
  const files = Array.isArray(options) ? options : options?.files
  const directories = Array.isArray(options) ? args[0] : options?.directories
  console.log(
    '[route-discovery-watch]' +
      JSON.stringify({
        files: relativePaths(files),
        directories: relativePaths(directories),
      })
  )
  return originalWatch.call(this, options, ...args)
}
