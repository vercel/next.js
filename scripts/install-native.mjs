import os from 'os'
import path from 'path'
import execa from 'execa'
import fs from 'fs/promises'
;(async function () {
  if (process.env.NEXT_SKIP_NATIVE_POSTINSTALL) {
    console.log(
      `Skipping next-swc postinstall due to NEXT_SKIP_NATIVE_POSTINSTALL env`
    )
    return
  }
  let cwd = process.cwd()
  const { version: nextVersion } = JSON.parse(
    await fs.readFile(
      path.join(cwd, 'packages', 'next', 'package.json'),
      'utf8'
    )
  )
  const { packageManager } = JSON.parse(
    await fs.readFile(path.join(cwd, 'package.json'), 'utf8')
  )

  try {
    // if installed swc package version matches monorepo version
    // we can skip re-installing
    for (const pkg of await fs.readdir(
      path.join(cwd, 'node_modules', '@next')
    )) {
      if (
        pkg.startsWith('swc-') &&
        JSON.parse(
          await fs.readFile(
            path.join(cwd, 'node_modules', '@next', pkg, 'package.json'),
            'utf8'
          )
        ).version === nextVersion
      ) {
        console.log(`@next/${pkg}@${nextVersion} already installed skipping`)
        return
      }
    }
  } catch (_) {}

  try {
    let tmpdir = path.join(os.tmpdir(), `next-swc-${Date.now()}`)
    await fs.mkdir(tmpdir, { recursive: true })
    let pkgJson = {
      name: 'dummy-package',
      version: '1.0.0',
      optionalDependencies: {
        '@next/swc-darwin-arm64': 'canary',
        '@next/swc-darwin-x64': 'canary',
        '@next/swc-linux-arm64-gnu': 'canary',
        '@next/swc-linux-arm64-musl': 'canary',
        '@next/swc-linux-x64-gnu': 'canary',
        '@next/swc-linux-x64-musl': 'canary',
        '@next/swc-win32-arm64-msvc': 'canary',
        '@next/swc-win32-ia32-msvc': 'canary',
        '@next/swc-win32-x64-msvc': 'canary',
      },
      packageManager,
    }
    await fs.writeFile(
      path.join(tmpdir, 'package.json'),
      JSON.stringify(pkgJson)
    )
    await fs.writeFile(path.join(tmpdir, '.npmrc'), 'node-linker=hoisted')
    let { stdout } = await execa('pnpm', ['add', 'next@canary'], {
      cwd: tmpdir,
    })
    console.log(stdout)
    let pkgs = await fs.readdir(path.join(tmpdir, 'node_modules/@next'))
    await fs.mkdir(path.join(cwd, 'node_modules/@next'), { recursive: true })

    await Promise.all(
      pkgs.map(async (pkg) => {
        let dest = path.join(cwd, 'node_modules/@next', pkg)
        try {
          // fs.rename() fails if the destination is a symlink
          await fs.unlink(dest)
        } catch {}
        await fs.rename(path.join(tmpdir, 'node_modules/@next', pkg), dest)
      })
    )
    await fs.rm(tmpdir, { recursive: true, force: true })
    console.log('Installed the following binary packages:', pkgs)
  } catch (e) {
    console.error(e)
    console.error('Failed to load @next/swc binary packages')
  }
})()
