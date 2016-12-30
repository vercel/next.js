import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import rreaddir from 'recursive-readdir'

export default async function gzipAssets (dir) {
  const nextDir = path.resolve(dir, '.next')

  const coreAssets = [
    path.join(nextDir, 'commons.js'),
    path.join(nextDir, 'main.js')
  ]
  const pages = await getAllPages(nextDir)
  const allAssets = [...coreAssets, ...pages]

  while (true) {
    // gzip only 10 assets in parallel at a time.
    const currentChunk = allAssets.splice(0, 10)
    if (currentChunk.length === 0) break

    const promises = currentChunk.map((filePath) => gzip(filePath))
    await Promise.all(promises)
  }
}

export function gzip (filePath) {
  const input = fs.createReadStream(filePath)
  const output = fs.createWriteStream(`${filePath}.gz`)

  return new Promise((resolve, reject) => {
    const stream = input.pipe(zlib.createGzip()).pipe(output)
    stream.on('error', reject)
    stream.on('finish', resolve)
  })
}

async function getAllPages (nextDir) {
  const pagesDir = path.join(nextDir, 'bundles', 'pages')

  return new Promise((resolve, reject) => {
    rreaddir(pagesDir, (err, pages) => {
      if (err) return reject(err)
      resolve(pages)
    })
  })
}
