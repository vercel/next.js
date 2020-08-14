const path = require('path')
const fs = require('fs-extra')

// getDirSize recursively gets size of all files in a directory
async function getDirSize(dir, ctx = { size: 0 }) {
  let subDirs = await fs.readdir(dir)
  subDirs = subDirs.map((d) => path.join(dir, d))

  await Promise.all(
    subDirs.map(async (curDir) => {
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
