#!/usr/bin/env node
// @ts-check

const path = require('path')
const { readdir } = require('fs/promises')
const { execSync } = require('child_process')
const { readJson } = require('fs-extra')

const cwd = process.cwd()

;(async function () {
  let isCanary = true

  if (!process.env.NPM_TOKEN) {
    console.log('No NPM_TOKEN, exiting...')
    return
  }

  try {
    const tagOutput = execSync('git describe --exact-match').toString()
    console.log(tagOutput)

    if (tagOutput.trim().startsWith('v')) {
      isCanary = tagOutput.includes('-canary')
    }
  } catch (err) {
    console.log(err)

    if (err.message && err.message.includes('no tag exactly matches')) {
      console.log('Nothing to publish, exiting...')
      return
    }
    throw err
  }
  console.log(`Publishing ${isCanary ? 'canary' : 'stable'}`)

  const packagesDir = path.join(cwd, 'packages')
  const packageDirs = await readdir(packagesDir)

  const publish = async (pkg, retry = 0) => {
    try {
      execSync(
        `npm publish ${path.join(packagesDir, pkg)} --access public${
          isCanary ? ' --tag canary' : ''
        }`
      )
    } catch (err) {
      console.error(`Failed to publish ${pkg}`, err)

      if (
        err.message &&
        err.message.includes(
          'You cannot publish over the previously published versions'
        )
      ) {
        console.error('Ignoring already published error', pkg)
        return
      }

      if (retry < 3) {
        const retryDelaySeconds = 15
        console.log(`retrying in ${retryDelaySeconds}s`)
        await new Promise((resolve) =>
          setTimeout(resolve, retryDelaySeconds * 1000)
        )
        await publish(pkg, retry + 1)
      }
      throw err
    }
  }

  for (const packageDir of packageDirs) {
    const pkgJson = await readJson(
      path.join(packagesDir, packageDir, 'package.json')
    )

    if (pkgJson.private) {
      console.log(`Skipping private package ${packageDir}`)
      continue
    }
    await publish(packageDir)
  }
})()
