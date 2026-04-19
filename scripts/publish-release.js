#!/usr/bin/env node
// @ts-check

const path = require('path')
const execa = require('execa')
const semver = require('semver')
const { Sema } = require('async-sema')
const { execSync } = require('child_process')
const fs = require('fs')

const cwd = process.cwd()

;(async function () {
  let isCanary = true
  let isReleaseCandidate = false
  let isBeta = false

  try {
    const tagOutput = execSync(
      `node ${path.join(__dirname, 'check-is-release.js')}`
    ).toString()
    console.log(tagOutput)

    if (tagOutput.trim().startsWith('v')) {
      isCanary = tagOutput.includes('-canary')
    }
    isReleaseCandidate = tagOutput.includes('-rc')
    isBeta = tagOutput.includes('-beta')
  } catch (err) {
    console.log(err)

    if (err.message && err.message.includes('no tag exactly matches')) {
      console.log('Nothing to publish, exiting...')
      return
    }
    throw err
  }

  let tag = isCanary
    ? 'canary'
    : isReleaseCandidate
      ? 'rc'
      : isBeta
        ? 'beta'
        : 'latest'

  try {
    if (!isCanary && !isReleaseCandidate && !isBeta) {
      const version = JSON.parse(
        await fs.promises.readFile(path.join(cwd, 'lerna.json'), 'utf-8')
      ).version

      const res = await fetch(
        `https://registry.npmjs.org/-/package/next/dist-tags`
      )
      const tags = await res.json()

      if (semver.lt(version, tags.latest)) {
        // If the current version is less than the latest, it means this
        // is a backport release. Since NPM sets the 'latest' tag by default
        // during publishing, when users install `next@latest`, they might
        // get the backported version instead of the actual "latest" version.
        // Therefore, we explicitly set the tag as 'backport' for backports.
        tag = 'backport'
      }
    }
  } catch (error) {
    console.log('Failed to fetch Next.js dist tags from the NPM registry.')
    throw error
  }

  console.log(`Publishing as "${tag}" dist tag...`)

  if (!process.env.NPM_TOKEN) {
    console.log('No NPM_TOKEN, exiting...')
    return
  }

  const packagesDir = path.join(cwd, 'packages')
  const packageDirs = fs.readdirSync(packagesDir)
  const publishSema = new Sema(2)

  const publish = async (pkg, retry = 0) => {
    let output = ''
    try {
      await publishSema.acquire()
      const child = execa(
        `npm`,
        [
          'publish',
          `${path.join(packagesDir, pkg)}`,
          '--access',
          'public',
          '--ignore-scripts',
          '--tag',
          tag,
        ],
        { stdio: 'pipe' }
      )
      const handleData = (type) => (chunk) => {
        process[type].write(chunk)
        output += chunk.toString()
      }
      child.stdout?.on('data', handleData('stdout'))
      child.stderr?.on('data', handleData('stderr'))
      // Return here to avoid retry logic
      return await child
    } catch (err) {
      console.error(`Failed to publish ${pkg}`, err)

      if (
        output.includes('cannot publish over the previously published versions')
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

  const undraft = async () => {
    const githubToken = process.env.RELEASE_BOT_GITHUB_TOKEN

    if (!githubToken) {
      throw new Error(`Missing RELEASE_BOT_GITHUB_TOKEN`)
    }

    if (isCanary) {
      try {
        const ghHeaders = {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${githubToken}`,
          'X-GitHub-Api-Version': '2022-11-28',
        }
        const { version: _version } = require('../lerna.json')
        const version = `v${_version}`

        let release
        let releasesData

        // The release might take a minute to show up in
        // the list so retry a bit
        for (let i = 0; i < 6; i++) {
          try {
            const releaseUrlRes = await fetch(
              `https://api.github.com/repos/vercel/next.js/releases`,
              {
                headers: ghHeaders,
              }
            )
            releasesData = await releaseUrlRes.json()

            release = releasesData.find(
              (release) => release.tag_name === version
            )
          } catch (err) {
            console.log(`Fetching release failed`, err)
          }
          if (!release) {
            console.log(`Retrying in 10s...`)
            await new Promise((resolve) => setTimeout(resolve, 10 * 1000))
          }
        }

        if (!release) {
          console.log(`Failed to find release`, releasesData)
          return
        }

        const undraftRes = await fetch(release.url, {
          headers: ghHeaders,
          method: 'PATCH',
          body: JSON.stringify({
            draft: false,
            name: version,
          }),
        })

        if (undraftRes.ok) {
          console.log('un-drafted canary release successfully')
        } else {
          console.log(`Failed to undraft`, await undraftRes.text())
        }
      } catch (err) {
        console.error(`Failed to undraft release`, err)
      }
    }
  }

  const results = await Promise.allSettled(
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

  if (results.some((item) => item.status === 'rejected')) {
    console.error(`Not all packages published successfully`, results)
    process.exit(1)
  }
  await undraft()
})()
