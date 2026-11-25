#!/usr/bin/env node
// @ts-check

const semver = require('semver')
const {
  getGitHubToken,
  getGitHubTokenMissingMessage,
} = require('./release-github-auth')
const { readReleaseVersion } = require('./release-version')

;(async function () {
  const version = readReleaseVersion()
  const parsedVersion = semver.parse(version)
  if (parsedVersion === null) {
    throw new Error(`Invalid version: ${version}`)
  }
  const { prerelease } = parsedVersion
  const isPrerelease = prerelease.length > 0

  if (!isPrerelease) {
    console.log('Not a prerelease: nothing to un-draft')
    return
  }
  const prereleaseChannel = prerelease[0]

  const githubToken = getGitHubToken()

  if (!githubToken) {
    throw new Error(getGitHubTokenMissingMessage())
  }

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
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
