const fs = require('fs/promises')
const path = require('path')
const { spawnSync } = require('child_process')
const { randomUUID } = require('crypto')

const root = path.resolve(__dirname, '../..')
const result = spawnSync('cargo', ['build', '-p', 'next-taskr', '--release'], {
  cwd: root,
  stdio: 'inherit',
})
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status || 1)
;(async () => {
  const name = process.platform === 'win32' ? 'next-taskr.exe' : 'next-taskr'
  const output = path.join(
    __dirname,
    'dist',
    `${process.platform}-${process.arch}`
  )
  const target = path.resolve(root, process.env.CARGO_TARGET_DIR || 'target')
  await fs.mkdir(output, { recursive: true })
  // Never overwrite an executable inode: it may still be running, and macOS
  // caches its code signature. Publish a complete binary with an atomic rename.
  const temporary = path.join(output, `.${name}-${randomUUID()}`)
  try {
    await fs.copyFile(path.join(target, 'release', name), temporary)
    await fs.rename(temporary, path.join(output, name))
  } finally {
    await fs.rm(temporary, { force: true })
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
