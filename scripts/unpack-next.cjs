#!/usr/bin/env node

const { NEXT_DIR, exec } = require('./pack-util.cjs')
const fs = require('fs')
const path = require('path')

const TARBALLS = `${NEXT_DIR}/tarballs`

const PROJECT_DIR = path.resolve(process.argv[2])

function realPathIfAny(path) {
  try {
    return fs.realpathSync(path)
  } catch {
    return null
  }
}
const packages = {
  next: realPathIfAny(`${PROJECT_DIR}/node_modules/next`),
  'next-swc': realPathIfAny(`${PROJECT_DIR}/node_modules/@next/swc`),
  'next-mdx': realPathIfAny(`${PROJECT_DIR}/node_modules/@next/mdx`),
  'next-bundle-analyzer': realPathIfAny(
    `${PROJECT_DIR}/node_modules/@next/bundle-anlyzer`
  ),
}

for (const [key, path] of Object.entries(packages)) {
  if (!path) continue
  exec(`Unpack ${key}`, `tar -xf '${TARBALLS}/${key}.tar' -C '${path}'`)
}
