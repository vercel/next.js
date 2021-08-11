#!/usr/bin/env node

const path = require('path')
const { readFile, readdir, writeFile } = require('fs/promises')
const { copy } = require('fs-extra')
const util = require('util')
const exec = util.promisify(require('child_process').exec)

const cwd = process.cwd()

;(async function () {
  let version = JSON.parse(await readFile(path.join(cwd, 'lerna.json'))).version
  let gitref = process.argv.slice(2)[0]

  // Copy binaries to package folders, update version, and publish
  let nativePackagesDir = path.join(cwd, 'packages/next/build/swc/npm')
  let nativePackages = await readdir(nativePackagesDir)
  let publishPromises = []
  for (let nativePackage of nativePackages) {
    if (nativePackage === '.gitignore') {
      continue
    }
    let binaryName = `next-swc.${nativePackage.substr(9)}.node`
    await copy(
      path.join(cwd, 'packages/next/build/swc/dist', binaryName),
      path.join(nativePackagesDir, nativePackage, binaryName)
    )
    let pkg = JSON.parse(
      await readFile(
        path.join(nativePackagesDir, nativePackage, 'package.json')
      )
    )
    pkg.version = version
    await writeFile(
      path.join(nativePackagesDir, nativePackage, 'package.json'),
      JSON.stringify(pkg, null, 2)
    )
    publishPromises.push(
      exec(
        `npm publish ${path.join(nativePackagesDir, nativePackage)}${
          gitref.contains('canary') ? ' --tag canary' : ''
        }`
      )
    )
    // lerna publish in next step will fail if git status is not clean
    publishPromises.push(
      exec(
        `git update-index --skip-worktree ${path.join(
          nativePackagesDir,
          nativePackage,
          'package.json'
        )}`
      )
    )
  }
  await Promise.all(publishPromises)

  // Update optional dependencies versions
  let nextPkg = JSON.parse(
    await readFile(path.join(cwd, 'packages/next/package.json'))
  )
  for (let name of nativePackages) {
    let optionalDependencies = nextPkg.optionalDependencies || {}
    optionalDependencies[name] = version
    nextPkg.optionalDependencies = optionalDependencies
  }
  await writeFile(
    path.join(path.join(cwd, 'packages/next/package.json')),
    JSON.stringify(nextPkg, null, 2)
  )
  // lerna publish in next step will fail if git status is not clean
  await exec('git update-index --skip-worktree packages/next/package.json')
})()
