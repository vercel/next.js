#!/usr/bin/env node
// @ts-check

const fs = require('fs/promises')
const path = require('path')
const {
  findExactWorkspacePrerequisites,
  readWorkspacePackages,
  waitForExactPackageVersions,
} = require('./npm-release-readiness')

async function main() {
  const cwd = process.cwd()
  const { version } = JSON.parse(
    await fs.readFile(path.join(cwd, 'lerna.json'), 'utf8')
  )

  if (typeof version !== 'string' || version.length === 0) {
    throw new Error(`Invalid version in lerna.json: ${version}`)
  }

  const packages = await readWorkspacePackages(path.join(cwd, 'packages'))
  const prerequisites = findExactWorkspacePrerequisites(packages, version)

  if (prerequisites.length === 0) {
    console.log(`No exact ${version} workspace prerequisites need an npm gate`)
    return
  }

  console.log(
    `Waiting for exact npm release prerequisites: ${prerequisites
      .map(({ manifest }) => `${manifest.name}@${version}`)
      .join(', ')}`
  )
  await waitForExactPackageVersions(prerequisites, version)
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}

module.exports = { main }
