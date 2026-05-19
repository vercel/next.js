import { getInput, info, setFailed } from '@actions/core'
import { put } from '@vercel/blob'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

/**
 * Yields one entry per package tarball under `tarballDirectory`. Scoped
 * packages are laid out one level deeper (e.g. `@next/env/<name>.tgz`), so
 * the walk descends into any directory whose name starts with `@`.
 */
async function* findTarballs(
  tarballDirectory: string
): AsyncGenerator<{ packageName: string; tarballPath: string }> {
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

async function findTarballInDir(dir: string): Promise<string | null> {
  const files = await fs.readdir(dir)
  const tgzFile = files.find((f) => f.endsWith('.tgz'))
  return tgzFile ? path.join(dir, tgzFile) : null
}

async function main(): Promise<void> {
  const commitSha = getInput('commit-sha', { required: true })
  const tarballDirectory = getInput('tarball-directory', { required: true })
  const blobAccess = getInput('blob-access', { required: true })

  // Read the token strictly from env -- never accept it as an action input
  // so a caller can't pass an unrelated higher-privileged token.
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN environment variable is required')
  }
  if (blobAccess !== 'private' && blobAccess !== 'public') {
    throw new Error(
      `blob-access input can only be "private" or "public" but got "${blobAccess}".`
    )
  }

  for await (const { packageName, tarballPath } of findTarballs(
    tarballDirectory
  )) {
    const blobPathname = `next/commits/${commitSha}/${packageName}.tgz`

    const fileBuffer = await fs.readFile(tarballPath)
    const { url } = await put(blobPathname, fileBuffer, {
      access: blobAccess,
      addRandomSuffix: false,
      contentType: 'application/gzip',
    })
    info(`Uploaded ${packageName} -> ${url}`)
  }

  info('All tarballs uploaded to Vercel Blob')
}

main().catch((err) => {
  setFailed(err instanceof Error ? (err.stack ?? err.message) : String(err))
})
