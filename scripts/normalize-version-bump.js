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
  const pkgNames = []
  await Promise.all(
    packages.map(async (pkgDir) => {
      const data = await readJson(
        path.join(cwd, 'packages', pkgDir, 'package.json')
      )
      pkgNames.push(data.name)
      pkgJsonData.set(pkgDir, data)
    })
  )
  const normalizeVersions = async (filePath, data) => {
    data = data || (await readJson(filePath))
    const version = data.version

    if (version) {
      data.version = NORMALIZED_VERSION
      const normalizeEntry = (type, key) => {
        const pkgVersion = data[type][key]

        if (pkgNames.includes(key) && pkgVersion === version) {
          data[type][key] = NORMALIZED_VERSION
        }
      }
      for (const key of Object.keys(data.dependencies || {})) {
        normalizeEntry('dependencies', key)
      }
      for (const key of Object.keys(data.devDependencies || {})) {
        normalizeEntry('devDependencies', key)
      }
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
  await normalizeVersions(path.join(cwd, 'lerna.json'))
  await fs.unlink(path.join(cwd, 'pnpm-lock.yaml'))
  await fs.writeFile(path.join(cwd, 'pnpm-lock.yaml'), '')

  const rootPkgJsonPath = path.join(cwd, 'package.json')
  await writeJson(rootPkgJsonPath, {
    name: 'nextjs-project',
    version: '0.0.0',
    private: true,
    workspaces: ['packages/*'],
    scripts: {},
  })
})()
