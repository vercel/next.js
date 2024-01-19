import { promises } from 'fs'
import * as Log from '../build/output/log'
import findUp from 'next/dist/compiled/find-up'
// @ts-ignore no-json types
import nextPkgJson from 'next/package.json'
import type { UnwrapPromise } from './coalesced-function'
import { isCI } from '../telemetry/ci-info'
import { getRegistry } from './helpers/get-registry'

let registry: string | undefined

async function fetchPkgInfo(pkg: string) {
  if (!registry) registry = getRegistry()
  const res = await fetch(`${registry}${pkg}`)

  if (!res.ok) {
    throw new Error(
      `Failed to fetch registry info for ${pkg}, got status ${res.status}`
    )
  }
  const data = await res.json()
  const versionData = data.versions[nextPkgJson.version]

  return {
    os: versionData.os,
    cpu: versionData.cpu,
    engines: versionData.engines,
    tarball: versionData.dist.tarball,
    integrity: versionData.dist.integrity,
  }
}

/**
 * Attempts to patch npm package-lock.json when it
 * fails to include optionalDependencies for other platforms
 * this can occur when the package-lock is rebuilt from a current
 * node_modules install instead of pulling fresh package data
 */
export async function patchIncorrectLockfile(dir: string) {
  if (process.env.NEXT_IGNORE_INCORRECT_LOCKFILE) {
    return
  }
  const lockfilePath = await findUp('package-lock.json', { cwd: dir })

  if (!lockfilePath) {
    // if no lockfile present there is no action to take
    return
  }
  const content = await promises.readFile(lockfilePath, 'utf8')
  // maintain current line ending
  const endingNewline = content.endsWith('\r\n')
    ? '\r\n'
    : content.endsWith('\n')
    ? '\n'
    : ''

  const lockfileParsed = JSON.parse(content)
  const lockfileVersion = parseInt(lockfileParsed?.lockfileVersion, 10)
  const expectedSwcPkgs = Object.keys(nextPkgJson['optionalDependencies'] || {})

  const patchDependency = (
    pkg: string,
    pkgData: UnwrapPromise<ReturnType<typeof fetchPkgInfo>>
  ) => {
    lockfileParsed.dependencies[pkg] = {
      version: nextPkgJson.version,
      resolved: pkgData.tarball,
      integrity: pkgData.integrity,
      optional: true,
    }
  }

  const patchPackage = (
    pkg: string,
    pkgData: UnwrapPromise<ReturnType<typeof fetchPkgInfo>>
  ) => {
    lockfileParsed.packages[pkg] = {
      version: nextPkgJson.version,
      resolved: pkgData.tarball,
      integrity: pkgData.integrity,
      cpu: pkgData.cpu,
      optional: true,
      os: pkgData.os,
      engines: pkgData.engines,
    }
  }

  try {
    const supportedVersions = [1, 2, 3]

    if (!supportedVersions.includes(lockfileVersion)) {
      // bail on unsupported version
      return
    }
    // v1 only uses dependencies
    // v2 uses dependencies and packages
    // v3 only uses packages
    const shouldPatchDependencies =
      lockfileVersion === 1 || lockfileVersion === 2
    const shouldPatchPackages = lockfileVersion === 2 || lockfileVersion === 3

    if (
      (shouldPatchDependencies && !lockfileParsed.dependencies) ||
      (shouldPatchPackages && !lockfileParsed.packages)
    ) {
      // invalid lockfile so bail
      return
    }
    const missingSwcPkgs = []
    let pkgPrefix: string | undefined

    if (shouldPatchPackages) {
      pkgPrefix = ''
      for (const pkg of Object.keys(lockfileParsed.packages)) {
        if (pkg.endsWith('node_modules/next')) {
          pkgPrefix = pkg.substring(0, pkg.length - 4)
        }
      }

      if (!pkgPrefix) {
        // unable to locate the next package so bail
        return
      }
    }

    for (const pkg of expectedSwcPkgs) {
      if (
        (shouldPatchDependencies && !lockfileParsed.dependencies[pkg]) ||
        (shouldPatchPackages && !lockfileParsed.packages[`${pkgPrefix}${pkg}`])
      ) {
        missingSwcPkgs.push(pkg)
      }
    }
    if (missingSwcPkgs.length === 0) {
      return
    }
    Log.warn(
      `Found lockfile missing swc dependencies,`,
      isCI ? 'run next locally to automatically patch' : 'patching...'
    )

    if (isCI) {
      // no point in updating in CI as the user can't save the patch
      return
    }
    const pkgsData = await Promise.all(
      missingSwcPkgs.map((pkg) => fetchPkgInfo(pkg))
    )

    for (let i = 0; i < pkgsData.length; i++) {
      const pkg = missingSwcPkgs[i]
      const pkgData = pkgsData[i]

      if (shouldPatchDependencies) {
        patchDependency(pkg, pkgData)
      }
      if (shouldPatchPackages) {
        patchPackage(`${pkgPrefix}${pkg}`, pkgData)
      }
    }

    await promises.writeFile(
      lockfilePath,
      JSON.stringify(lockfileParsed, null, 2) + endingNewline
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
