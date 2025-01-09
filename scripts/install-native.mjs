import os from 'os'
import path from 'path'
import execa from 'execa'
import fs from 'fs'
import fsp from 'fs/promises'
;(async function () {
  if (process.env.NEXT_SKIP_NATIVE_POSTINSTALL) {
    console.log(
      `Skipping next-swc postinstall due to NEXT_SKIP_NATIVE_POSTINSTALL env`
    )
    return
  }
  let cwd = process.cwd()
  const { version: nextVersion } = JSON.parse(
    fs.readFileSync(path.join(cwd, 'packages', 'next', 'package.json'))
  )
  const { packageManager } = JSON.parse(
    fs.readFileSync(path.join(cwd, 'package.json'))
  )

  try {
    // if installed swc package version matches monorepo version
    // we can skip re-installing
    for (const pkg of fs.readdirSync(path.join(cwd, 'node_modules', '@next'))) {
      if (
        pkg.startsWith('swc-') &&
        JSON.parse(
          fs.readFileSync(
            path.join(cwd, 'node_modules', '@next', pkg, 'package.json')
          )
        ).version === nextVersion
      ) {
        console.log(`@next/${pkg}@${nextVersion} already installed, skipping`)
        return
      }
    }
  } catch {}

  try {
    let tmpdir = path.join(os.tmpdir(), `next-swc-${Date.now()}`)
    fs.mkdirSync(tmpdir, { recursive: true })
    let pkgJson = {
      name: 'dummy-package',
      version: '1.0.0',
      optionalDependencies: {
        '@next/swc-darwin-arm64': nextVersion,
        '@next/swc-darwin-x64': nextVersion,
        '@next/swc-linux-arm64-gnu': nextVersion,
        '@next/swc-linux-arm64-musl': nextVersion,
        '@next/swc-linux-x64-gnu': nextVersion,
        '@next/swc-linux-x64-musl': nextVersion,
        '@next/swc-win32-arm64-msvc': nextVersion,
        '@next/swc-win32-x64-msvc': nextVersion,
      },
      packageManager,
    }
    fs.writeFileSync(path.join(tmpdir, 'package.json'), JSON.stringify(pkgJson))
    fs.writeFileSync(path.join(tmpdir, '.npmrc'), 'node-linker=hoisted')

    let { stdout } = await execa('pnpm', ['add', `next@${nextVersion}`], {
      cwd: tmpdir,
    })
    console.log(stdout)

    let pkgs = fs.readdirSync(path.join(tmpdir, 'node_modules/@next'))
    fs.mkdirSync(path.join(cwd, 'node_modules/@next'), { recursive: true })

    await Promise.all(
      pkgs.map(async (pkg) => {
        const from = path.join(tmpdir, 'node_modules/@next', pkg)
        const to = path.join(cwd, 'node_modules/@next', pkg)
        // The directory from pnpm store is a symlink, which can not be overwritten,
        // so we remove the existing directory before copying
        await fsp.rm(to, { recursive: true, force: true })
        // Renaming is flaky on Windows, and the tmpdir is going to be deleted anyway,
        // so we use copy the directory instead
        return fsp.cp(from, to, { force: true, recursive: true })
      })
    )
    fs.rmSync(tmpdir, { recursive: true, force: true })
    console.log('Installed the following binary packages:', pkgs)
  } catch (e) {
    console.error(e)
    console.error('Failed to load @next/swc binary packages')
  }
})()
