#!/usr/bin/env node
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const raw = fs
  .readFileSync(path.join(__dirname, 'sccache-version'), 'utf-8')
  .trim()
const [url, ref] = raw.split('#')

const args = [
  'install',
  '--git',
  url,
  '--locked',
  '--root',
  path.join(root, 'target', 'sccache'),
]
if (ref) {
  // Use --rev for commit hashes, --branch for branch names
  const flag = /^[0-9a-f]{7,40}$/.test(ref) ? '--rev' : '--branch'
  args.push(flag, ref)
}
args.push('sccache')

execSync(`cargo ${args.join(' ')}`, { stdio: 'inherit', cwd: root })
