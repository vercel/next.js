#!/usr/bin/env node

// Compare build artifacts without normalizing their contents. Run both builders
// at the same absolute path and snapshot each result before running the next.
const fs = require('fs/promises')
const path = require('path')
const { createHash } = require('crypto')

async function manifest(root) {
  const entries = new Map()
  async function visit(relative) {
    const absolute = path.join(root, relative)
    const stat = await fs.lstat(absolute)
    const entry = { mode: stat.mode & 0o777 }
    if (stat.isSymbolicLink()) {
      entry.type = 'symlink'
      entry.target = await fs.readlink(absolute)
    } else if (stat.isDirectory()) {
      entry.type = 'directory'
      for (const name of (await fs.readdir(absolute)).sort()) {
        await visit(path.join(relative, name))
      }
    } else if (stat.isFile()) {
      entry.type = 'file'
      entry.size = stat.size
      entry.hash = createHash('sha256')
        .update(await fs.readFile(absolute))
        .digest('hex')
    } else {
      throw new Error(`Unsupported artifact: ${absolute}`)
    }
    if (relative) entries.set(relative, entry)
  }
  await visit('')
  return new Map([...entries].sort(([a], [b]) => a.localeCompare(b)))
}

async function snapshot(source, destination) {
  source = path.resolve(source)
  destination = path.resolve(destination)
  const relative = path.relative(source, destination)
  if (
    !relative ||
    (!relative.startsWith('..' + path.sep) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  ) {
    throw new Error('The snapshot must be outside the source directory')
  }
  // Never overwrite an earlier reference build.
  await fs.mkdir(destination, { recursive: false })
  await fs.cp(source, destination, {
    recursive: true,
    dereference: false,
    verbatimSymlinks: true,
    preserveTimestamps: true,
  })
  return manifest(destination)
}

async function compare(reference, candidate, { strictModes = false } = {}) {
  const [left, right] = await Promise.all([
    manifest(reference),
    manifest(candidate),
  ])
  const differences = []
  for (const name of [...new Set([...left.keys(), ...right.keys()])].sort()) {
    const a = left.get(name)
    const b = right.get(name)
    if (!a || !b) {
      differences.push({ path: name, reason: a ? 'missing' : 'extra' })
    } else if (a.type !== b.type) {
      differences.push({
        path: name,
        reason: 'type',
        reference: a.type,
        candidate: b.type,
      })
    } else {
      // WASI transforms in the legacy process can race with its umask. Package
      // compatibility requires executable bits; strict mode exposes every bit
      // when investigating those existing permission races.
      if (
        strictModes ? a.mode !== b.mode : (a.mode & 0o111) !== (b.mode & 0o111)
      ) {
        differences.push({
          path: name,
          reason: 'mode',
          reference: a.mode.toString(8),
          candidate: b.mode.toString(8),
        })
      }
      if (a.target !== b.target) {
        differences.push({
          path: name,
          reason: 'symlink',
          reference: a.target,
          candidate: b.target,
        })
      }
      if (a.hash !== b.hash) {
        const [x, y] = await Promise.all([
          fs.readFile(path.join(reference, name)),
          fs.readFile(path.join(candidate, name)),
        ])
        let offset = 0
        while (
          offset < x.length &&
          offset < y.length &&
          x[offset] === y[offset]
        )
          offset++
        differences.push({
          path: name,
          reason: 'bytes',
          offset,
          referenceSize: x.length,
          candidateSize: y.length,
        })
      }
    }
  }
  return {
    files: [...left.values()].filter((entry) => entry.type === 'file').length,
    differences,
  }
}

module.exports = { manifest, snapshot, compare }

if (require.main === module) {
  const [command, source, destination] = process.argv.slice(2)
  ;(async () => {
    if (!source || !destination || !['snapshot', 'compare'].includes(command)) {
      throw new Error(
        'Usage: node scripts/taskr-parity.js <snapshot|compare> <source> <destination>'
      )
    }
    if (command === 'snapshot') {
      const result = await snapshot(source, destination)
      console.log(
        `Saved ${result.size} artifacts to ${path.resolve(destination)}`
      )
    } else {
      const result = await compare(source, destination, {
        strictModes: process.argv.includes('--strict-modes'),
      })
      console.log(JSON.stringify(result, null, 2))
      if (result.differences.length) process.exitCode = 1
    }
  })().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
