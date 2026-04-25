// @ts-check
const { put } = require('@vercel/blob')
const fs = require('node:fs/promises')
const path = require('node:path')

async function main() {
  const [githubHeadSha, tarballDirectory] = process.argv.slice(2)
  if (!githubHeadSha || !tarballDirectory) {
    throw new Error(
      'Usage: node scripts/upload-preview-tarballs.js <commitSha> <tarballDirectory>'
    )
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN environment variable is required')
  }

  const packageDirs = await fs.readdir(tarballDirectory)
  for (const packageName of packageDirs) {
    const dir = path.join(tarballDirectory, packageName)
    const stat = await fs.stat(dir)
    if (!stat.isDirectory()) continue

    const files = await fs.readdir(dir)
    const tgzFile = files.find((f) => f.endsWith('.tgz'))
    if (!tgzFile) continue

    const blobPathname = `next/commits/${githubHeadSha}/${packageName}.tgz`

    const fileBuffer = await fs.readFile(path.join(dir, tgzFile))
    const { url } = await put(blobPathname, fileBuffer, {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'application/gzip',
    })
    console.info(`Uploaded ${packageName} -> ${url}`)
  }

  console.info('All tarballs uploaded to Vercel Blob')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
