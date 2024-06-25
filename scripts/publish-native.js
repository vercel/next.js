#!/usr/bin/env node

const path = require('path')
const execa = require('execa')
const { Sema } = require('async-sema')
const { readFile, readdir, writeFile, cp } = require('fs/promises')

const cwd = process.cwd()

;(async function () {
  try {
    const publishSema = new Sema(2)

    let version = JSON.parse(
      await readFile(path.join(cwd, 'lerna.json'))
    ).version

    // Copy binaries to package folders, update version, and publish
    let nativePackagesDir = path.join(cwd, 'packages/next-swc/crates/napi/npm')
    let platforms = (await readdir(nativePackagesDir)).filter(
      (name) => !name.startsWith('.')
    )

    await Promise.all(
      platforms.map(async (platform) => {
        await publishSema.acquire()
        let output = ''

        try {
          let binaryName = `next-swc.${platform}.node`
          await cp(
            path.join(cwd, 'packages/next-swc/native', binaryName),
            path.join(nativePackagesDir, platform, binaryName)
          )
          let pkg = JSON.parse(
            await readFile(
              path.join(nativePackagesDir, platform, 'package.json')
            )
          )
          pkg.version = version
          await writeFile(
            path.join(nativePackagesDir, platform, 'package.json'),
            JSON.stringify(pkg, null, 2)
          )
          const child = execa(
            `npm`,
            [
              `publish`,
              `${path.join(nativePackagesDir, platform)}`,
              `--access`,
              `public`,
              ...(version.includes('canary') ? ['--tag', 'canary'] : []),
            ],
            { stdio: 'inherit' }
          )
          const handleData = (type) => (chunk) => {
            process[type].write(chunk)
            output += chunk.toString()
          }
          child.stdout?.on('data', handleData('stdout'))
          child.stderr?.on('data', handleData('stderr'))
          await child
        } catch (err) {
          // don't block publishing other versions on single platform error
          console.error(`Failed to publish`, platform, err)

          if (
            output.includes(
              'cannot publish over the previously published versions'
            )
          ) {
            console.error('Ignoring already published error', platform, err)
          } else {
            // throw err
          }
        } finally {
          publishSema.release()
        }
      })
    )

    // Update name/version of wasm packages and publish
    const pkgDirectory = 'packages/next-swc/crates/wasm'
    let wasmDir = path.join(cwd, pkgDirectory)
    await Promise.all(
      ['web', 'nodejs'].map(async (wasmTarget) => {
        await publishSema.acquire()
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
        try {
          await execa(
            `npm`,
            [
              'publish',
              `${path.join(wasmDir, `pkg-${wasmTarget}`)}`,
              '--access',
              'public',
              ...(version.includes('canary') ? ['--tag', 'canary'] : []),
            ],
            { stdio: 'inherit' }
          )
        } catch (err) {
          // don't block publishing other versions on single platform error
          console.error(`Failed to publish`, wasmTarget, err)
          if (
            err.message &&
            err.message.includes(
              'You cannot publish over the previously published versions'
            )
          ) {
            console.error('Ignoring already published error', wasmTarget)
          } else {
            // throw err
          }
        } finally {
          publishSema.release()
        }
      })
    )

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
