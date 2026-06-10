#!/usr/bin/env node
// @ts-check

const path = require('path')
const execa = require('execa')
const semver = require('semver')
const fs = require('fs')
const {
  getGitHubToken,
  getGitHubTokenMissingMessage,
} = require('./release-github-auth')

const cwd = process.cwd()
const dryRun = process.argv.includes('--dry-run')
const maxPublishAttempts = 4
const publishRetryDelaySeconds = 15

;(async function () {
  const version = JSON.parse(
    await fs.promises.readFile(path.join(cwd, 'lerna.json'), 'utf-8')
  ).version
  const parsedVersion = semver.parse(version)
  if (parsedVersion === null) {
    throw new Error(`Invalid version in lerna.json: ${version}`)
  }
  console.log(
    dryRun
      ? `Dry run: not publishing ${version} to npm`
      : `Publishing ${version}`
  )

  const prereleaseChannel = parsedVersion.prerelease[0]
  const isPrerelease = prereleaseChannel != null

  let tag = isPrerelease ? String(prereleaseChannel) : 'latest'

  try {
    if (!isPrerelease) {
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
        // But force @latest tag if we accidentally tagged a prerelase as latest
        if (!semver.prerelease(tags.latest)) {
          tag = 'backport'
        }
      }
    }
  } catch (error) {
    console.log('Failed to fetch Next.js dist tags from the NPM registry.')
    throw error
  }

  console.log(`Publishing as "${tag}" dist tag...`)

  // pnpm publish --recursive respects the workspace topological order,
  // skips private packages, and skips packages whose version is already
  // published. We wrap the whole invocation in a retry loop so transient
  // registry failures don't abort the release.
  const publish = async (attempt = 1) => {
    try {
      await execa(
        'pnpm',
        [
          '--filter',
          './packages/**',
          'publish',
          '--recursive',
          '--access',
          'public',
          '--no-git-checks',
          '--ignore-scripts',
          '--report-summary',
          '--tag',
          tag,
          ...(dryRun ? ['--dry-run'] : []),
        ],
        { stdio: 'inherit', cwd }
      )
    } catch (err) {
      console.error(
        `Publish attempt ${attempt} of ${maxPublishAttempts} failed`,
        err
      )
      if (attempt >= maxPublishAttempts) {
        throw err
      }
      console.log(`retrying in ${publishRetryDelaySeconds}s`)
      await new Promise((resolve) =>
        setTimeout(resolve, publishRetryDelaySeconds * 1000)
      )
      await publish(attempt + 1)
    }
  }

  const undraft = async () => {
    if (dryRun) {
      console.log('Dry run: skipping GitHub release un-draft')
      return
    }
    const githubToken = getGitHubToken()

    if (!githubToken) {
      throw new Error(getGitHubTokenMissingMessage())
    }

    if (isPrerelease) {
      try {
        const ghHeaders = {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${githubToken}`,
          'X-GitHub-Api-Version': '2022-11-28',
        }
        const tag = `v${version}`

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

            release = releasesData.find((release) => release.tag_name === tag)
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
            name: tag,
          }),
        })

        if (undraftRes.ok) {
          console.log(`un-drafted ${prereleaseChannel} release successfully`)
        } else {
          console.log(`Failed to undraft`, await undraftRes.text())
        }
      } catch (err) {
        console.error(`Failed to undraft release`, err)
      }
    }
  }

  try {
    await publish()
  } catch (err) {
    console.error('Publish failed after all retries', err)
    process.exit(1)
  }
  await undraft()
})()
