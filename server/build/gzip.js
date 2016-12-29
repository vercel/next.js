import fs from 'fs'
import path from 'path'
import zlib from 'zlib'

export default async function gzipAssets (dir) {
  const nextDir = path.resolve(dir, '.next')

  await Promise.all([
    gzip(path.resolve(nextDir, 'commons.js')),
    gzip(path.resolve(nextDir, 'main.js'))
  ])
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
