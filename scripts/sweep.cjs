#!/usr/bin/env node

const { existsSync, rmSync, readdirSync } = require('fs')
const { join } = require('path')
const { NEXT_DIR, exec, logCommand } = require('./pack-util.cjs')

const sweepInstalled = existsSync(`${process.env.CARGO_HOME}/bin/cargo-sweep`)
const cacheInstalled = existsSync(`${process.env.CARGO_HOME}/bin/cargo-cache`)

function removeNestedNext(directory) {
  const items = readdirSync(directory, { withFileTypes: true })

  for (const item of items) {
    const fullPath = join(directory, item.name)
    if (item.isDirectory()) {
      if (item.name === 'node_modules' || item.name === '.git') {
        // skip
      } else if (item.name === '.next') {
        console.log(`removing ${fullPath}`)
        rmSync(fullPath, { recursive: true, force: true })
      } else {
        removeNestedNext(fullPath)
      }
    }
  }
}

logCommand(`Remove .next directories`)
removeNestedNext(NEXT_DIR)

logCommand(`Remove .cache directories`)
rmSync(join(NEXT_DIR, 'node_modules/.cache'), { recursive: true, force: true })

rmSync('target/rust-analyzer/debug/incremental', {
  recursive: true,
  force: true,
})
function removeDirs(title, prefix) {
  logCommand(title)
  rmSync(`${prefix}target/tmp`, { recursive: true, force: true })
  rmSync(`${prefix}target/release/incremental`, {
    recursive: true,
    force: true,
  })
  rmSync(`${prefix}target/debug/incremental`, { recursive: true, force: true })
}
removeDirs('Remove incremental dirs', '')

exec('Prune pnpm', 'pnpm prune', {
  env: {
    ...process.env,
    // We don't need to download the native build as we are not going to use it
    NEXT_SKIP_NATIVE_POSTINSTALL: '1',
  },
})
exec('Prune pnpm store', 'pnpm store prune')

if (!sweepInstalled) exec('Install cargo-sweep', 'cargo install cargo-sweep')

if (existsSync('target')) {
  exec('Sweep', 'cargo sweep --maxsize 20000')
}

function chunkArray(array, chunkSize) {
  const chunks = []
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize))
  }
  return chunks
}
// git tag -d $(git tag -l)
const tags = exec('Get tags', `git tag -l`, {
  stdio: ['inherit', 'pipe', 'inherit'],
})
  .toString()
  .trim()
  .split('\n')
for (const someTags of chunkArray(tags, 100)) {
  exec('Delete local tags', `git tag -d ${someTags.join(' ')}`)
}
exec('Fetch & prune', 'git fetch -p')

exec('Git GC', 'git gc --prune=1day')

if (!cacheInstalled) exec('Install cargo-cache', 'cargo install cargo-cache')
exec('Optimize cargo cache', 'cargo cache -e')
