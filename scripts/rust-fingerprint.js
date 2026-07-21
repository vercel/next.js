#!/usr/bin/env node
// Write the turbo-computed TURBO_HASH to a stamp file.
// This is used as a turbo task whose only purpose is to compute
// a fingerprint of all Rust inputs. The build_and_deploy workflow
// reads this stamp to derive the actions/cache key for the compiled
// next-swc native binary without re-hashing everything.

const fs = require('fs')
const path = require('path')

const stamp = path.resolve(__dirname, '..', 'target', '.rust-fingerprint')

if (!process.env.TURBO_HASH) {
  console.log('rust-fingerprint: skipping (not running under turbo)')
  process.exit(0)
}

fs.mkdirSync(path.dirname(stamp), { recursive: true })
fs.writeFileSync(stamp, process.env.TURBO_HASH)
console.log(`rust-fingerprint: ${process.env.TURBO_HASH}`)
