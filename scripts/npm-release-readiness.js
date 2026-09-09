// @ts-check

const fs = require('fs/promises')
const path = require('path')

const DEFAULT_REGISTRY = 'https://registry.npmjs.org'
const DEFAULT_ATTEMPTS = 60
const DEFAULT_DELAY_SECONDS = 10

const EXACT_DEPENDENCY_FIELDS = ['dependencies', 'optionalDependencies']

/**
 * @param {string} value
 * @param {number} fallback
 */
function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * Find public workspace packages which must be registry-ready before another
 * workspace package with the same exact version can be installed.
 *
 * @param {Array<{ dir: string, manifest: any }>} packages
 * @param {string} version
 */
function findExactWorkspacePrerequisites(packages, version) {
  const publicWorkspacePackages = new Map(
    packages
      .filter(({ manifest }) => !manifest.private && manifest.name)
      .map((pkg) => [pkg.manifest.name, pkg])
  )
  const prerequisites = new Map()

  for (const { manifest: consumer } of packages) {
    if (consumer.private) continue

    for (const field of EXACT_DEPENDENCY_FIELDS) {
      for (const [dependencyName, dependencyVersion] of Object.entries(
        consumer[field] || {}
      )) {
        const dependency = publicWorkspacePackages.get(dependencyName)
        if (
          dependency &&
          dependencyVersion === version &&
          dependency.manifest.version === version
        ) {
          prerequisites.set(dependencyName, dependency)
        }
      }
    }
  }

  return [...prerequisites.values()].sort((a, b) =>
    a.manifest.name.localeCompare(b.manifest.name)
  )
}

/**
 * Split prerequisites into dependency-first publication layers. This keeps the
 * gate correct if a future exact-version prerequisite itself gains an exact
 * workspace dependency.
 *
 * @param {Array<{ dir: string, manifest: any }>} packages
 * @param {string} version
 */
function getExactWorkspacePublishLayers(packages, version) {
  const prerequisites = findExactWorkspacePrerequisites(packages, version)
  const remaining = new Map(
    prerequisites.map((pkg) => [pkg.manifest.name, pkg])
  )
  const layers = []

  while (remaining.size > 0) {
    const layer = [...remaining.values()].filter(({ manifest }) =>
      EXACT_DEPENDENCY_FIELDS.every((field) =>
        Object.entries(manifest[field] || {}).every(
          ([dependencyName, dependencyVersion]) =>
            dependencyVersion !== version || !remaining.has(dependencyName)
        )
      )
    )

    if (layer.length === 0) {
      throw new Error(
        `Circular exact-version workspace dependencies among: ${[
          ...remaining.keys(),
        ].join(', ')}`
      )
    }

    layer.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name))
    layers.push(layer)
    for (const { manifest } of layer) remaining.delete(manifest.name)
  }

  return layers
}

/**
 * @param {string} packagesDir
 */
async function readWorkspacePackages(packagesDir) {
  const entries = await fs.readdir(packagesDir, { withFileTypes: true })
  const packages = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const dir = path.join(packagesDir, entry.name)
    try {
      const manifest = JSON.parse(
        await fs.readFile(path.join(dir, 'package.json'), 'utf8')
      )
      packages.push({ dir, manifest })
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') {
        throw error
      }
    }
  }

  return packages
}

/**
 * Poll npm's exact-version metadata endpoint. A dist-tag is insufficient here:
 * dependents pin this exact version and npm can expose their metadata first.
 *
 * @param {string} name
 * @param {string} version
 * @param {{
 *   attempts?: number,
 *   delaySeconds?: number,
 *   fetchImpl?: typeof fetch,
 *   registry?: string,
 *   sleep?: (milliseconds: number) => Promise<void>,
 * }} [options]
 */
async function waitForExactPackageVersion(name, version, options = {}) {
  const attempts =
    options.attempts ??
    positiveInteger(
      process.env.NPM_PUBLISH_READINESS_ATTEMPTS || '',
      DEFAULT_ATTEMPTS
    )
  const delaySeconds =
    options.delaySeconds ??
    positiveInteger(
      process.env.NPM_PUBLISH_READINESS_DELAY_SECONDS || '',
      DEFAULT_DELAY_SECONDS
    )
  const fetchImpl = options.fetchImpl || fetch
  const sleep =
    options.sleep ||
    ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)))
  const registry = (options.registry || DEFAULT_REGISTRY).replace(/\/$/, '')
  const url = `${registry}/${encodeURIComponent(name)}/${encodeURIComponent(version)}`
  let lastStatus = 'no response'

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetchImpl(url, {
        headers: { 'cache-control': 'no-cache' },
      })
      lastStatus = `${response.status} ${response.statusText}`.trim()
      if (response.ok) {
        console.log(`${name}@${version} is available from npm`)
        return
      }
    } catch (error) {
      lastStatus = error instanceof Error ? error.message : String(error)
    }

    if (attempt < attempts) {
      console.log(
        `${name}@${version} is not available from npm yet (${lastStatus}); retrying in ${delaySeconds}s (${attempt}/${attempts})`
      )
      await sleep(delaySeconds * 1000)
    }
  }

  throw new Error(
    `${name}@${version} was not available from npm after ${attempts} attempts (last result: ${lastStatus})`
  )
}

/**
 * @param {Array<{ manifest: { name: string } }>} packages
 * @param {string} version
 * @param {Parameters<typeof waitForExactPackageVersion>[2]} [options]
 */
async function waitForExactPackageVersions(packages, version, options) {
  await Promise.all(
    packages.map(({ manifest }) =>
      waitForExactPackageVersion(manifest.name, version, options)
    )
  )
}

/**
 * @param {{
 *   packages: Array<{ dir: string, manifest: any }>,
 *   version: string,
 *   npmDistTag: string,
 *   dryRun: boolean,
 *   publish: (label: string, args: string[]) => Promise<unknown>,
 *   waitForVersions?: typeof waitForExactPackageVersions,
 * }} options
 */
async function publishWorkspacePackages(options) {
  const {
    packages,
    version,
    npmDistTag,
    dryRun,
    publish,
    waitForVersions = waitForExactPackageVersions,
  } = options
  const publishLayers = getExactWorkspacePublishLayers(packages, version)
  const prerequisites = publishLayers.flat()
  const publishOptions = [
    '--access',
    'public',
    '--no-git-checks',
    '--ignore-scripts',
    '--tag',
    npmDistTag,
    ...(dryRun ? ['--dry-run'] : []),
  ]

  for (const layer of publishLayers) {
    await Promise.all(
      layer.map(({ manifest }) =>
        publish(manifest.name, [
          '--filter',
          manifest.name,
          'publish',
          ...publishOptions,
        ])
      )
    )

    if (!dryRun) {
      await waitForVersions(layer, version)
    }
  }

  await publish('workspace', [
    '--filter',
    './packages/**',
    ...prerequisites.flatMap(({ manifest }) => [
      '--filter',
      `!${manifest.name}`,
    ]),
    'publish',
    '--recursive',
    ...publishOptions,
    '--report-summary',
  ])

  return prerequisites
}

module.exports = {
  findExactWorkspacePrerequisites,
  getExactWorkspacePublishLayers,
  publishWorkspacePackages,
  readWorkspacePackages,
  waitForExactPackageVersion,
  waitForExactPackageVersions,
}
