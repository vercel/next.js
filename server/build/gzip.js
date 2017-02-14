import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import glob from 'glob-promise'

export default async function gzipAssets (dir, buildFolder = '.next') {
  const nextDir = path.resolve(dir, buildFolder)

  const coreAssets = [
    path.join(nextDir, 'commons.js'),
    path.join(nextDir, 'main.js')
  ]
  const pages = await glob('bundles/pages/**/*.json', { cwd: nextDir })

  const allAssets = [
    ...coreAssets,
    ...pages.map(page => path.join(nextDir, page))
  ]

  while (true) {
    // gzip only 10 assets in parallel at a time.
    const currentChunk = allAssets.splice(0, 10)
    if (currentChunk.length === 0) break

    await Promise.all(currentChunk.map(gzip))
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
