// File copy helpers used by precompile.mjs.

import { promises as fs } from 'node:fs'
import path from 'node:path'

async function walk(dir, rel = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const entryRel = rel ? path.join(rel, entry.name) : entry.name
    const entryAbs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walk(entryAbs, entryRel)))
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      files.push(entryRel)
    }
  }
  return files
}

// Heuristic: apply `transform` only to files that are plausibly text. Anything
// outside this set is copied byte-for-byte so we don't corrupt binaries.
const TEXT_EXTS = new Set([
  '.js', '.mjs', '.cjs', '.jsx',
  '.ts', '.mts', '.cts', '.tsx',
  '.json', '.jsonc',
  '.md', '.mdx', '.txt',
  '.css', '.scss', '.html',
])

function isTextFile(relPath) {
  if (relPath.endsWith('.d.ts')) return true
  return TEXT_EXTS.has(path.extname(relPath))
}

export async function copyDir(srcDir, destDir, { filter, transform, rename } = {}) {
  const files = await walk(srcDir)
  await fs.mkdir(destDir, { recursive: true })
  await Promise.all(
    files.map(async (relPath) => {
      if (filter && !filter(relPath)) return
      const srcFile = path.join(srcDir, relPath)
      const destRel = rename ? rename(relPath) : relPath
      const destFile = path.join(destDir, destRel)
      await fs.mkdir(path.dirname(destFile), { recursive: true })
      if (transform && isTextFile(relPath)) {
        const contents = await fs.readFile(srcFile, 'utf8')
        const next = await transform(contents, relPath)
        await fs.writeFile(destFile, next)
      } else {
        await fs.copyFile(srcFile, destFile)
      }
    })
  )
}

export async function copyFiles(srcDir, destDir, files) {
  await fs.mkdir(destDir, { recursive: true })
  await Promise.all(
    files.map(async (relPath) => {
      const srcFile = path.join(srcDir, relPath)
      const destFile = path.join(destDir, relPath)
      await fs.mkdir(path.dirname(destFile), { recursive: true })
      await fs.copyFile(srcFile, destFile)
    })
  )
}
