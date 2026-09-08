const fs = require('fs/promises')
const path = require('path')
const { spawnSync } = require('child_process')

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
  await fs.copyFile(path.join(target, 'release', name), path.join(output, name))
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
