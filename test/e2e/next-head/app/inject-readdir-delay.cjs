const fs = require('node:fs')
const path = require('node:path')

const pagesDir = path.join(process.cwd(), 'pages')
const originalReaddir = fs.readdir
let injected = false

fs.readdir = function readdir(directory, ...args) {
  const stack = new Error().stack
  if (!injected && directory === pagesDir && stack.includes('watchpack')) {
    injected = true
    console.log('[next-head] delaying initial Watchpack pages scan')
    return setTimeout(
      () => originalReaddir.call(this, directory, ...args),
      1000
    )
  }

  return originalReaddir.call(this, directory, ...args)
}
