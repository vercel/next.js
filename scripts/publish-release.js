#!/usr/bin/env node
// @ts-check

const path = require('path')
const execa = require('execa')
const { Sema } = require('async-sema')
const { execSync } = require('child_process')
const fs = require('fs')

const cwd = process.cwd()

;(async function () {
  let isCanary = true

  try {
    const tagOutput = execSync(
      `node ${path.join(__dirname, 'check-is-release.js')}`
    ).toString()
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

  if (!process.env.NPM_TOKEN) {
    console.log('No NPM_TOKEN, exiting...')
    return
  }

  const packagesDir = path.join(cwd, 'packages')
  const packageDirs = fs.readdirSync(packagesDir)
  const publishSema = new Sema(2)

  const publish = async (pkg, retry = 0) => {
    try {
      await publishSema.acquire()
      await execa(
        `npm`,
        [
          'publish',
          `${path.join(packagesDir, pkg)}`,
          '--access',
          'public',
          '--ignore-scripts',
          ...(isCanary ? ['--tag', 'canary'] : []),
        ],
        { stdio: 'inherit' }
      )
      // Return here to avoid retry logic
      return
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

      if (retry >= 3) {
        throw err
      }
    } finally {
      publishSema.release()
    }
    // Recursive call need to be outside of the publishSema
    const retryDelaySeconds = 15
    console.log(`retrying in ${retryDelaySeconds}s`)
    await new Promise((resolve) =>
      setTimeout(resolve, retryDelaySeconds * 1000)
    )
    await publish(pkg, retry + 1)
  }

  await Promise.allSettled(
    packageDirs.map(async (packageDir) => {
      const pkgJson = JSON.parse(
        await fs.promises.readFile(
          path.join(packagesDir, packageDir, 'package.json'),
          'utf-8'
        )
      )

      if (pkgJson.private) {
        console.log(`Skipping private package ${packageDir}`)
        return
      }
      await publish(packageDir)
    })
  )
})()
