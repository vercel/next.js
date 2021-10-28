#!/usr/bin/env node

const path = require('path')
const { readFile, readdir, writeFile } = require('fs/promises')
const { copy } = require('fs-extra')
const { execSync } = require('child_process')

const cwd = process.cwd()

;(async function () {
  try {
    let version = JSON.parse(
      await readFile(path.join(cwd, 'lerna.json'))
    ).version
    let gitref = process.argv.slice(2)[0]

    // Copy binaries to package folders, update version, and publish
    let nativePackagesDir = path.join(cwd, 'packages/next/build/swc/npm')
    let platforms = await readdir(nativePackagesDir)
    const filteredPlatforms = platforms.filter((name) => !name.startsWith('.'))
    const publishedPkgs = new Set()
    // TODO: update to latest version where all pacakges were
    // successfully published
    const fallbackVersion = `12.0.1`

    for (let platform of filteredPlatforms) {
      try {
        let binaryName = `next-swc.${platform}.node`
        await copy(
          path.join(cwd, 'packages/next/build/swc/dist', binaryName),
          path.join(nativePackagesDir, platform, binaryName)
        )
        let pkg = JSON.parse(
          await readFile(path.join(nativePackagesDir, platform, 'package.json'))
        )
        pkg.version = version
        await writeFile(
          path.join(nativePackagesDir, platform, 'package.json'),
          JSON.stringify(pkg, null, 2)
        )
        execSync(
          `npm publish ${path.join(
            nativePackagesDir,
            platform
          )} --access public ${
            gitref.includes('canary') ? ' --tag canary' : ''
          }`
        )
        publishedPkgs.add(platform)
      } catch (err) {
        // don't block publishing other versions on single platform error
        console.error(`Failed to publish`, platform, err)
      }
      // lerna publish in next step will fail if git status is not clean
      execSync(
        `git update-index --skip-worktree ${path.join(
          nativePackagesDir,
          platform,
          'package.json'
        )}`
      )
    }

    // Update optional dependencies versions
    let nextPkg = JSON.parse(
      await readFile(path.join(cwd, 'packages/next/package.json'))
    )
    for (let platform of platforms) {
      let optionalDependencies = nextPkg.optionalDependencies || {}
      optionalDependencies['@next/swc-' + platform] = publishedPkgs.has(
        platform
      )
        ? version
        : fallbackVersion
      nextPkg.optionalDependencies = optionalDependencies
    }
    await writeFile(
      path.join(path.join(cwd, 'packages/next/package.json')),
      JSON.stringify(nextPkg, null, 2)
    )
    // lerna publish in next step will fail if git status is not clean
    execSync('git update-index --skip-worktree packages/next/package.json')
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
})()
