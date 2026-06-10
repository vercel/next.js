#!/usr/bin/env node

const path = require('path')
const execa = require('execa')
const semver = require('semver')
const { Sema } = require('async-sema')
const { readFile, readdir, writeFile, cp } = require('fs/promises')

const cwd = process.cwd()
const dryRun = process.argv.includes('--dry-run')
const maxPublishAttempts = 4
const publishRetryDelaySeconds = 15

;(async function () {
  try {
    if (dryRun) {
      console.log('Dry run: not publishing native packages to npm')
    }
    const publishSema = new Sema(2)

    let version = require('@next/swc/package.json').version
    const parsedVersion = semver.parse(version)
    if (parsedVersion === null) {
      throw new Error(`Invalid version in @next/swc/package.json: ${version}`)
    }
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

    const publish = async (label, pkgPath, attempt = 1) => {
      let output = ''
      try {
        await publishSema.acquire()
        const child = execa(
          `npm`,
          [
            'publish',
            pkgPath,
            '--access',
            'public',
            '--tag',
            tag,
            ...(dryRun ? ['--dry-run'] : []),
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
        console.error(
          `Failed to publish ${label} (attempt ${attempt} of ${maxPublishAttempts})`,
          err
        )

        if (
          output.includes(
            'cannot publish over the previously published versions'
          )
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
      await publish(label, pkgPath, attempt + 1)
    }

    // Copy binaries to package folders, update version, and publish
    let nativePackagesDir = path.join(cwd, 'crates/next-napi-bindings/npm')
    let platforms = (await readdir(nativePackagesDir)).filter(
      (name) => !name.startsWith('.')
    )

    const nativeResults = await Promise.allSettled(
      platforms.map(async (platform) => {
        let binaryName = `next-swc.${platform}.node`
        try {
          await cp(
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

        let pkg = JSON.parse(
          await readFile(path.join(nativePackagesDir, platform, 'package.json'))
        )
        pkg.version = version
        await writeFile(
          path.join(nativePackagesDir, platform, 'package.json'),
          JSON.stringify(pkg, null, 2)
        )
        await publish(platform, path.join(nativePackagesDir, platform))
      })
    )

    // Update name/version of wasm packages and publish
    const pkgDirectory = 'crates/wasm'
    let wasmDir = path.join(cwd, pkgDirectory)
    const wasmResults = await Promise.allSettled(
      ['web', 'nodejs'].map(async (wasmTarget) => {
        let wasmPkg = JSON.parse(
          await readFile(path.join(wasmDir, `pkg-${wasmTarget}/package.json`))
        )
        wasmPkg.name = `@next/swc-wasm-${wasmTarget}`
        wasmPkg.version = version
        wasmPkg.repository = {
          type: 'git',
          url: 'https://github.com/vercel/next.js',
          directory: pkgDirectory,
        }
        await writeFile(
          path.join(wasmDir, `pkg-${wasmTarget}/package.json`),
          JSON.stringify(wasmPkg, null, 2)
        )
        await publish(wasmTarget, path.join(wasmDir, `pkg-${wasmTarget}`))
      })
    )

    const results = [...nativeResults, ...wasmResults]
    if (results.some((item) => item.status === 'rejected')) {
      console.error(`Not all packages published successfully`, results)
      process.exit(1)
    }

    // Update optional dependencies versions
    let nextPkg = JSON.parse(
      await readFile(path.join(cwd, 'packages/next/package.json'))
    )
    for (let platform of platforms) {
      let optionalDependencies = nextPkg.optionalDependencies || {}
      optionalDependencies['@next/swc-' + platform] = version
      nextPkg.optionalDependencies = optionalDependencies
    }
    await writeFile(
      path.join(path.join(cwd, 'packages/next/package.json')),
      JSON.stringify(nextPkg, null, 2)
    )
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
})()
