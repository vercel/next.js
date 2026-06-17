#!/usr/bin/env node
// @ts-check

const path = require('path')
const execa = require('execa')
const semver = require('semver')
const { Sema } = require('async-sema')
const fs = require('fs/promises')
const {
  getGitHubToken,
  getGitHubTokenMissingMessage,
} = require('./release-github-auth')

const cwd = process.cwd()
const dryRun = process.argv.includes('--dry-run')
const maxPublishAttempts = 4
const publishRetryDelaySeconds = 15

;(async function () {
  if (dryRun) {
    console.log('Dry run: not publishing to npm')
  }
  const publishSema = new Sema(2)

  const { version } = JSON.parse(
    await fs.readFile(path.join(cwd, 'lerna.json'), 'utf-8')
  )
  const parsedVersion = semver.parse(version)
  if (parsedVersion === null) {
    throw new Error(`Invalid version in lerna.json: ${version}`)
  }
  const prereleaseChannel = parsedVersion.prerelease[0]
  const isPrerelease = prereleaseChannel != null
  console.log(`Publishing ${version}`)

  let npmDistTag = isPrerelease ? String(prereleaseChannel) : 'latest'

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
          npmDistTag = 'backport'
        }
      }
    }
  } catch (error) {
    console.log('Failed to fetch Next.js dist tags from the NPM registry.')
    throw error
  }

  console.log(`Publishing as "${npmDistTag}" dist tag...`)

  const publish = async (label, args, attempt = 1) => {
    let output = ''
    try {
      await publishSema.acquire()
      const child = execa('pnpm', args, { stdio: 'pipe' })
      const handleData = (type) => (chunk) => {
        process[type].write(chunk)
        output += chunk.toString()
      }
      child.stdout?.on('data', handleData('stdout'))
      child.stderr?.on('data', handleData('stderr'))
      // Return here to avoid retry logic
      return await child
    } catch (err) {
      console.error(
        `Failed to publish ${label} (attempt ${attempt} of ${maxPublishAttempts})`,
        err
      )

      if (
        output.includes('cannot publish over the previously published versions')
      ) {
        console.error('Ignoring already published error', label)
        return
      }

      if (attempt >= maxPublishAttempts) {
        throw err
      }
    } finally {
      publishSema.release()
    }
    // Recursive call need to be outside of the publishSema
    console.log(`retrying ${label} in ${publishRetryDelaySeconds}s`)
    await new Promise((resolve) =>
      setTimeout(resolve, publishRetryDelaySeconds * 1000)
    )
    await publish(label, args, attempt + 1)
  }

  // Copy binaries to package folders, update version, and publish
  const nativePackagesDir = path.join(cwd, 'crates/next-napi-bindings/npm')
  const platforms = (await fs.readdir(nativePackagesDir)).filter(
    (name) => !name.startsWith('.')
  )

  const nativeResults = await Promise.allSettled(
    platforms.map(async (platform) => {
      const binaryName = `next-swc.${platform}.node`
      try {
        await fs.cp(
          path.join(cwd, 'packages/next-swc/native', binaryName),
          path.join(nativePackagesDir, platform, binaryName)
        )
      } catch (error) {
        if (dryRun) {
          console.warn(
            `Binary ${binaryName} not found, but ignoring due to dry run`
          )
          return
        }
        throw error
      }

      const pkgDir = path.join(nativePackagesDir, platform)
      const pkg = JSON.parse(
        await fs.readFile(path.join(pkgDir, 'package.json'), {
          encoding: 'utf-8',
        })
      )
      pkg.version = version
      await fs.writeFile(
        path.join(pkgDir, 'package.json'),
        JSON.stringify(pkg, null, 2)
      )
      await publish(platform, [
        'publish',
        pkgDir,
        '--access',
        'public',
        '--no-git-checks',
        '--ignore-scripts',
        '--tag',
        npmDistTag,
        ...(dryRun ? ['--dry-run'] : []),
      ])
    })
  )

  // Update name/version of wasm packages and publish
  const pkgDirectory = 'crates/wasm'
  const wasmDir = path.join(cwd, pkgDirectory)
  const wasmResults = await Promise.allSettled(
    ['web', 'nodejs'].map(async (wasmTarget) => {
      const pkgDir = path.join(wasmDir, `pkg-${wasmTarget}`)
      const wasmPkg = JSON.parse(
        await fs.readFile(path.join(pkgDir, 'package.json'), {
          encoding: 'utf-8',
        })
      )
      wasmPkg.name = `@next/swc-wasm-${wasmTarget}`
      wasmPkg.version = version
      wasmPkg.repository = {
        type: 'git',
        url: 'https://github.com/vercel/next.js',
        directory: pkgDirectory,
      }
      await fs.writeFile(
        path.join(pkgDir, 'package.json'),
        JSON.stringify(wasmPkg, null, 2)
      )
      await publish(`wasm-${wasmTarget}`, [
        'publish',
        pkgDir,
        '--access',
        'public',
        '--no-git-checks',
        '--ignore-scripts',
        '--tag',
        npmDistTag,
        ...(dryRun ? ['--dry-run'] : []),
      ])
    })
  )

  const results = [...nativeResults, ...wasmResults]
  if (results.some((item) => item.status === 'rejected')) {
    console.error(`Not all packages published successfully`, results)
    process.exit(1)
  }

  // Update optional dependencies versions
  const nextPkg = JSON.parse(
    await fs.readFile(path.join(cwd, 'packages/next/package.json'), {
      encoding: 'utf-8',
    })
  )
  for (const platform of platforms) {
    const optionalDependencies = nextPkg.optionalDependencies || {}
    optionalDependencies['@next/swc-' + platform] = version
    nextPkg.optionalDependencies = optionalDependencies
  }
  await fs.writeFile(
    path.join(cwd, 'packages/next/package.json'),
    JSON.stringify(nextPkg, null, 2)
  )

  await publish('workspace', [
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
    npmDistTag,
    ...(dryRun ? ['--dry-run'] : []),
  ])

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
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
