#!/usr/bin/env node
// @ts-check

/*
 This prevents busting the turbo cache un-necessarily due 
 to bumping the version in the repo's package.json files
*/
const path = require('path')
const fs = require('fs')
const fsp = require('fs/promises')

const cwd = process.cwd()
const NORMALIZED_VERSION = '0.0.0'

const readJson = async (filePath) =>
  JSON.parse(await fsp.readFile(filePath, 'utf8'))

const writeJson = async (filePath, data) =>
  fsp.writeFile(filePath, JSON.stringify(data, null, 2) + '\n')

;(async function () {
  const packages = (await fsp.readdir(path.join(cwd, 'packages'))).filter(
    (pkgDir) => {
      return fs.statSync(path.join(cwd, 'packages', pkgDir)).isDirectory()
    }
  )

  const pkgJsonData = new Map()
  const pkgNames = []
  await Promise.all(
    packages.map(async (pkgDir) => {
      const subPath = path.join(cwd, 'packages', pkgDir)
      const data = await readJson(path.join(subPath, 'package.json'))
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
  await fsp.unlink(path.join(cwd, 'pnpm-lock.yaml'))
  await fsp.writeFile(path.join(cwd, 'pnpm-lock.yaml'), '')

  const rootPkgJsonPath = path.join(cwd, 'package.json')
  await writeJson(rootPkgJsonPath, {
    name: 'nextjs-project',
    version: '0.0.0',
    private: true,
    workspaces: ['packages/*'],
    scripts: {},
  })
})()
