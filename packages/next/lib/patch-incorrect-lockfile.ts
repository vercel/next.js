import { promises } from 'fs'
import '../server/node-polyfill-fetch'
import * as Log from '../build/output/log'
import findUp from 'next/dist/compiled/find-up'

/**
 * Attempts to patch npm package-lock.json when it
 * fails to include optionalDependencies for other platforms
 * this can occur when the package-lock is rebuilt from a current
 * node_modules install instead of pulling fresh package data
 */
export async function patchIncorrectLockfile(dir: string) {
  const lockfilePath = await findUp('package-lock.json', { cwd: dir })

  if (!lockfilePath) {
    // if no lockfile present there is no action to take
    return
  }
  const content = await promises.readFile(lockfilePath, 'utf8')
  const lockfileParsed = JSON.parse(content)

  const foundSwcPkgs = new Set()
  const nextPkg = lockfileParsed.packages?.['node_modules/next']

  // if we don't find next in the package-lock we can't continue
  if (!nextPkg) {
    return
  }
  const nextVersion = nextPkg.version
  const packageKeys = Object.keys(lockfileParsed.dependencies || {})

  const expectedSwcPkgs = Object.keys(nextPkg?.optionalDependencies).filter(
    (pkg) => pkg.startsWith('@next/swc-')
  )

  packageKeys.forEach((pkgKey) => {
    const swcIndex = pkgKey.indexOf('@next/swc-')
    if (swcIndex > -1) {
      foundSwcPkgs.add(pkgKey.substring(swcIndex))
    }
  })

  // if swc package keys are missing manually populate them
  // so installs on different platforms can succeed
  // user will need to run npm i after to ensure it's corrected
  if (foundSwcPkgs.size !== expectedSwcPkgs.length) {
    Log.warn(`Found lockfile missing swc dependencies, patching..`)

    try {
      // populate fields for each missing swc pkg
      for (const pkg of expectedSwcPkgs) {
        if (!foundSwcPkgs.has(pkg)) {
          const res = await fetch(`https://registry.npmjs.org/${pkg}`)

          if (!res.ok) {
            throw new Error(
              `Failed to fetch registry info for ${pkg}, got status ${res.status}`
            )
          }
          const data = await res.json()
          const version = data.versions[nextVersion]

          if (!version) {
            throw new Error(
              `Failed to find matching version for ${pkg} at ${nextVersion}`
            )
          }
          if (lockfileParsed.dependencies) {
            lockfileParsed.dependencies[pkg] = {
              version: nextVersion,
              resolved: version.dist.tarball,
              integrity: version.dist.integrity,
              optional: true,
            }
          }
          lockfileParsed.packages[`node_modules/${pkg}`] = {
            version: nextVersion,
            resolved: version.dist.tarball,
            integrity: version.dist.integrity,
            cpu: version.cpu,
            optional: true,
            os: version.os,
            engines: version.engines,
          }
        }
      }

      await promises.writeFile(
        lockfilePath,
        `${JSON.stringify(lockfileParsed, null, 2)}\n`
      )
      Log.warn(
        'Lockfile was successfully patched, please run "npm install" to ensure @next/swc dependencies are downloaded'
      )
    } catch (err) {
      Log.error(
        `Failed to patch lockfile, please try uninstalling and reinstalling next in this workspace`
      )
      console.error(err)
    }
  }
}
