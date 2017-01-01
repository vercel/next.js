import fs from 'fs'
import path from 'path'
import iltorb from 'iltorb'
import zopfli from 'node-zopfli'
import glob from 'glob-promise'

export default async function compressAssets (dir) {
  const nextDir = path.resolve(dir, '.next')

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
    // compress only 10 assets in parallel at a time.
    const currentChunk = allAssets.splice(0, 10)
    if (currentChunk.length === 0) break

    await Promise.all(currentChunk.map(gzip))
    await Promise.all(currentChunk.map(brotli))
  }
}

export function gzip (filePath) {
  const input = fs.createReadStream(filePath)
  const output = fs.createWriteStream(`${filePath}.gz`)

  return new Promise((resolve, reject) => {
    const stream = input.pipe(zopfli.createGzip()).pipe(output)
    stream.on('error', reject)
    stream.on('finish', resolve)
  })
}

export function brotli (filePath) {
  const input = fs.createReadStream(filePath)
  const output = fs.createWriteStream(`${filePath}.br`)

  return new Promise((resolve, reject) => {
    const stream = input.pipe(iltorb.compressStream()).pipe(output)
    stream.on('error', reject)
    stream.on('finish', resolve)
  })
}
