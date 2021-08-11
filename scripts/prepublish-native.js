#!/usr/bin/env node

const path = require('path')
const { readFile, readdir, writeFile } = require('fs/promises')
const { copy } = require('fs-extra')

const cwd = process.cwd()

;(async function () {
  let version = JSON.parse(await readFile(path.join(cwd, 'lerna.json'))).version

  // Copy binaries to package folders, update version, and copy package folders to packages directory
  let nativePackagesDir = path.join(cwd, 'packages/next/build/swc/npm')
  let nativePackages = await readdir(nativePackagesDir)
  for (let nativePackage of nativePackages) {
    let binaryName = `next-swc.${nativePackage.substr(9)}.node`
    await copy(
      path.join(cwd, 'packages/next/native', binaryName),
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
  }
  await copy(
    path.join(cwd, 'packages/next/build/swc/npm'),
    path.join(cwd, 'packages')
  )

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
})()
