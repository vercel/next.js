const fs = require('node:fs')
const path = require('node:path')

const target = path.join(process.cwd(), 'pages', 'a')
const originalReaddir = fs.readdir
let injected = false

fs.readdir = function readdir(directory, ...args) {
  const stack = new Error().stack
  const callback = args[args.length - 1]
  if (
    !injected &&
    directory === target &&
    stack.includes('watchpack') &&
    typeof callback === 'function'
  ) {
    injected = true
    console.log('[next-head] failing initial Watchpack pages/a scan')
    return setTimeout(
      () =>
        callback(
          Object.assign(new Error(`EPERM: scandir '${directory}'`), {
            code: 'EPERM',
            syscall: 'scandir',
            path: directory,
          })
        ),
      10
    )
  }

  return originalReaddir.call(this, directory, ...args)
}
