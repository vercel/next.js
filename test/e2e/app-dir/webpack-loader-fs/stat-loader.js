const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')

module.exports = async function () {
  const dir = path.dirname(this.resourcePath)
  const target = path.join(dir, 'stat-target.bin')
  const stat = (p, options) =>
    new Promise((resolve, reject) => {
      const callback = (err, stats) => (err ? reject(err) : resolve(stats))
      if (options === undefined) this.fs.stat(p, callback)
      else this.fs.stat(p, options, callback)
    })
  const error = async (p) => {
    try {
      await stat(p)
      return null
    } catch (err) {
      let nodeError
      try {
        fs.statSync(p)
      } catch (error) {
        nodeError = error
      }
      return {
        code: err.code,
        syscall: err.syscall,
        correctPath: err.path === p,
        matchesNode:
          err.code === nodeError.code && err.syscall === nodeError.syscall,
      }
    }
  }

  const file = await stat(target)
  const bigint = await stat(target, { bigint: true })
  const buffer = await stat(Buffer.from(target))
  const url = await stat(pathToFileURL(target))
  const directory = await stat(dir)
  const root = await stat(this.rootContext)
  const linkedDirectory = await stat(
    path.join(dir, 'path/to/symlink/inner/path')
  )
  const linkedFile = await stat(
    path.join(dir, 'path/to/symlink/inner/path/one.txt')
  )
  const optionalPath = path.join(dir, 'optional.bin')
  let optional
  try {
    const stats = await stat(optionalPath)
    optional = stats.isDirectory() ? 'directory' : 'file'
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
    optional = 'missing'
  }

  return `module.exports = ${JSON.stringify({
    file: file.isFile(),
    directory: directory.isDirectory(),
    root: root.isDirectory(),
    symlink: linkedDirectory.isSymbolicLink(),
    linkedDirectory: linkedDirectory.isDirectory(),
    linkedSize: linkedFile.size,
    size: file.size,
    mtimeMs: file.mtimeMs,
    date: file.mtime instanceof Date,
    bigint: typeof bigint.size,
    bigintSize: bigint.size.toString(),
    bufferSize: buffer.size,
    urlSize: url.size,
    mode: file.mode,
    matchesNode:
      file instanceof fs.Stats && file.size === fs.statSync(target).size,
    missing: await error(path.join(dir, 'missing/child.bin')),
    notDirectory: await error(path.join(target, 'child.bin')),
    notDirectoryDeep: await error(path.join(target, 'child/grandchild.bin')),
    missingParent: await error(`${dir}/missing/../stat-target.bin`),
    notDirectoryParent: await error(`${target}/../stat-target.bin`),
    optional,
  })}`
}
