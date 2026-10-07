#!/usr/bin/env node
// @ts-check

/*
 This prevents busting the turbo cache un-necessarily due
 to bumping the version in the repo's package.json files
*/
const path = require('path')
const fs = require('fs/promises')

const cwd = process.cwd()
const NORMALIZED_VERSION = '0.0.0'

const readJson = async (filePath) =>
  JSON.parse(await fs.readFile(filePath, 'utf8'))

const writeJson = async (filePath, data) =>
  fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n')

;(async function () {
  const packages = await fs.readdir(path.join(cwd, 'packages'))

  const pkgJsonData = new Map()
  await Promise.all(
    packages.map(async (pkgDir) => {
      const data = await readJson(
        path.join(cwd, 'packages', pkgDir, 'package.json')
      )
      pkgJsonData.set(pkgDir, data)
    })
  )
  // Internal dependencies use the `workspace:*` protocol, so they carry no
  // version to normalize -- only each package's own `version` field does.
  const normalizeVersions = async (filePath, data) => {
    data = data || (await readJson(filePath))

    if (data.version) {
      data.version = NORMALIZED_VERSION
      await writeJson(filePath, data)
    }
  }
  await Promise.all(
    packages.map((pkgDir) =>
      normalizeVersions(
        path.join(cwd, 'packages', pkgDir, 'package.json'),
        pkgJsonData.get(pkgDir)
      )
    )
  )
  await fs.unlink(path.join(cwd, 'pnpm-lock.yaml'))
  await fs.writeFile(path.join(cwd, 'pnpm-lock.yaml'), '')

  const rootPkgJsonPath = path.join(cwd, 'package.json')
  await writeJson(rootPkgJsonPath, {
    name: 'nextjs-project',
    version: '0.0.0',
    private: true,
    workspaces: ['packages/*'],
    scripts: {},
    packageManager: 'pnpm@10.33.0',
  })
})()
