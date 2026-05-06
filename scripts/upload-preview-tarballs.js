// @ts-check
const { put } = require('@vercel/blob')
const fs = require('node:fs/promises')
const path = require('node:path')

/**
 * Yields one entry per package tarball under `tarballDirectory`. Scoped
 * packages are laid out one level deeper (e.g. `@next/env/<name>.tgz`), so the
 * walk descends into any directory whose name starts with `@`.
 *
 * @param {string} tarballDirectory
 * @returns {AsyncGenerator<{ packageName: string, tarballPath: string }>}
 */
async function* findTarballs(tarballDirectory) {
  const entries = await fs.readdir(tarballDirectory, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const entryPath = path.join(tarballDirectory, entry.name)
    if (entry.name.startsWith('@')) {
      const scopeEntries = await fs.readdir(entryPath, { withFileTypes: true })
      for (const scopeEntry of scopeEntries) {
        if (!scopeEntry.isDirectory()) continue
        const tarballPath = await findTarballInDir(
          path.join(entryPath, scopeEntry.name)
        )
        if (tarballPath === null) continue
        yield {
          packageName: `${entry.name}/${scopeEntry.name}`,
          tarballPath,
        }
      }
    } else {
      const tarballPath = await findTarballInDir(entryPath)
      if (tarballPath === null) continue
      yield { packageName: entry.name, tarballPath }
    }
  }
}

/**
 * @param {string} dir
 * @returns {Promise<string | null>}
 */
async function findTarballInDir(dir) {
  const files = await fs.readdir(dir)
  const tgzFile = files.find((f) => f.endsWith('.tgz'))
  return tgzFile ? path.join(dir, tgzFile) : null
}

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
  const blobAccess = process.env.BLOB_ACCESS
  if (blobAccess !== 'private' && blobAccess !== 'public') {
    throw new Error(
      `BLOB_ACCESS environment variable can only be "private" or "public" but got "${blobAccess}".`
    )
  }

  for await (const { packageName, tarballPath } of findTarballs(
    tarballDirectory
  )) {
    const blobPathname = `next/commits/${githubHeadSha}/${packageName}.tgz`

    const fileBuffer = await fs.readFile(tarballPath)
    const { url } = await put(blobPathname, fileBuffer, {
      access: blobAccess,
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
