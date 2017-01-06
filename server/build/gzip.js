import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import glob from 'glob-promise'
import getConfig from '../config'

export default async function gzipAssets (dir) {
  const nextDir = path.resolve(dir, '.next')
  const config = getConfig(dir)

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

    await Promise.all(currentChunk.map((f) => compress(config, f)))
  }
}

export function compress (config, filePath) {
  const compressionMap = config.compress || {
    gzip: () => zlib.createGzip()
  }

  const promises = Object.keys(compressionMap).map((type) => {
    return new Promise(async (resolve, reject) => {
      const input = fs.createReadStream(filePath)
      const output = fs.createWriteStream(`${filePath}.${type}`)
      // We accept stream resolved via a promise or not
      const compression = await compressionMap[type](filePath)

      // We need to handle errors like this.
      // See: http://stackoverflow.com/a/22389498
      input.on('error', reject)
      compression.on('error', reject)

      const stream = input.pipe(compression).pipe(output)

      // Handle the final stream
      stream.on('error', reject)
      stream.on('finish', resolve)
    })
  })

  return Promise.all(promises)
}
