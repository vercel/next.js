const fs = require('fs/promises')
const { constants } = require('fs')
const path = require('path')
const { randomUUID } = require('crypto')

// SWC keys compiled WASM modules by plugin contents and runtime version. Seed a
// private cache with copies, so workers do not read one another's writes.
// Newly compiled modules are published only after that worker has exited.
async function copyCache(source, destination, publish = false) {
  let entries
  try {
    entries = await fs.readdir(source, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return
    throw error
  }
  await fs.mkdir(destination, { recursive: true })
  await Promise.all(
    entries.map(async (entry) => {
      if (entry.name.startsWith('.next-taskr-')) return
      const from = path.join(source, entry.name)
      const to = path.join(destination, entry.name)
      if (entry.isDirectory()) return copyCache(from, to, publish)
      // Cache files are regular files. Do not carry symlinks into the private cwd.
      if (!entry.isFile()) return
      if (!publish) return fs.copyFile(from, to, constants.COPYFILE_FICLONE)
      try {
        await fs.access(to)
        return
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
      const temporary = path.join(destination, `.next-taskr-${randomUUID()}`)
      try {
        await fs.copyFile(from, temporary, constants.COPYFILE_FICLONE)
        try {
          // Linking publishes a complete file without replacing an existing key.
          await fs.link(temporary, to)
        } catch (error) {
          if (error.code !== 'EEXIST') throw error
        }
      } finally {
        await fs.rm(temporary, { force: true })
      }
    })
  )
}

module.exports = { copyCache }
