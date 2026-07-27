const path = require('path')
const fs = require('fs/promises')

// getDirSize recursively gets size of all files in a directory
async function getDirSize(dir, ctx = { size: 0 }) {
  let subDirs = await fs.readdir(dir)
  subDirs = subDirs.map((d) => path.join(dir, d))

  await Promise.all(
    subDirs.map(async (curDir) => {
      // we use dev builds so the size isn't helpful to track
      // here as it's not reflective of full releases
      if (curDir.includes('@next/swc')) return

      const fileStat = await fs.stat(curDir)
      if (fileStat.isDirectory()) {
        return getDirSize(curDir, ctx)
      }
      ctx.size += fileStat.size
    })
  )
  return ctx.size
}

module.exports = getDirSize
