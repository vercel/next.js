import fs from 'fs'
import path from 'path'
import uuid from 'uuid'

export default function replaceCurrentBuild (dir, buildFolder, distFolder) {
  const distDir = path.resolve(dir, distFolder)
  const buildDir = path.resolve(dir, buildFolder)
  const oldDir = path.resolve(dir, `.next-${uuid.v4()}`)

  return new Promise((resolve, reject) => {
    fs.rename(distDir, oldDir, () => {
      fs.rename(buildDir, distDir, (err) => {
        if (err) return reject(err)
        resolve(oldDir)
      })
    })
  })
}
