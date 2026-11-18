// @ts-check

const fs = require('fs')
const path = require('path')

/**
 * Every package in this repo is versioned in lockstep, so any of their
 * manifests carries the release version. `packages/next/package.json` is the
 * canonical one: it is always published and is not going to be renamed.
 */
const VERSION_SOURCE_PATH = path.join(
  __dirname,
  '..',
  'packages',
  'next',
  'package.json'
)

/**
 * @returns {string} the current release version e.g. `16.4.0-canary.22`
 */
function readReleaseVersion() {
  const { version } = JSON.parse(fs.readFileSync(VERSION_SOURCE_PATH, 'utf8'))

  if (typeof version !== 'string' || version === '') {
    throw new Error(`Invalid version in ${VERSION_SOURCE_PATH}`)
  }

  return version
}

module.exports = { readReleaseVersion }
