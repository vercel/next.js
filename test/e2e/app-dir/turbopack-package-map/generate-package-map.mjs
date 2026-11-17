// Writes `package-map.json`, a Node.js package map
// (https://nodejs.org/api/packages.html#package-maps) for this app, like a
// package manager would. The packages that were installed into `node_modules`
// keep their locations and get the dependencies their `package.json` declares.
// The packages of `store/` are not in any `node_modules` folder, so only the
// package map can locate them.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const appDir = import.meta.dirname

/** @type {Record<string, { url: string, dependencies: Record<string, string> }>} */
const packages = {}
/** The package ID of each package location. @type {Map<string, string>} */
const packageIds = new Map()

/** Finds the directory that `name` refers to from `dir`, like Node.js would. */
function findInNodeModules(dir, name) {
  for (let current = dir; ; current = path.dirname(current)) {
    const candidate =
      path.basename(current) === 'node_modules'
        ? path.join(current, name)
        : path.join(current, 'node_modules', name)
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      return candidate
    }
    if (current === path.dirname(current)) {
      return undefined
    }
  }
}

/** Adds the package at `dir` and its dependencies, and returns its ID. */
function addInstalledPackage(dir, includeDevDependencies = false) {
  const location = fs.realpathSync(dir)
  const existingId = packageIds.get(location)
  if (existingId !== undefined) {
    return existingId
  }

  const packageJson = JSON.parse(
    fs.readFileSync(path.join(location, 'package.json'), 'utf8')
  )
  const id = `${packageJson.name ?? 'app'}@${packageJson.version ?? '0.0.0'}#${packageIds.size}`
  packageIds.set(location, id)

  /** @type {Record<string, string>} */
  const dependencies = {}
  // Both forms of the location are valid: a URL relative to the package map,
  // and an absolute `file:` URL.
  packages[id] = {
    url:
      location === appDir
        ? '.'
        : packageIds.size % 2 === 0
          ? pathToFileURL(location).href
          : path.relative(appDir, location).split(path.sep).join('/'),
    dependencies,
  }

  const names = Object.keys({
    ...packageJson.dependencies,
    ...packageJson.peerDependencies,
    ...packageJson.optionalDependencies,
    ...(includeDevDependencies ? packageJson.devDependencies : undefined),
  })
  for (const name of names) {
    const dependencyDir = findInNodeModules(location, name)
    if (dependencyDir !== undefined) {
      dependencies[name] = addInstalledPackage(dependencyDir)
    }
  }
  return id
}

const appId = addInstalledPackage(appDir, true)

// `greeting` and the app depend on different versions of `shared`.
packages['greeting@1.0.0'] = {
  url: './store/greeting-1.0.0',
  dependencies: { shared: 'shared@1.0.0' },
}
packages['shared@1.0.0'] = { url: './store/shared-1.0.0', dependencies: {} }
packages['shared@2.0.0'] = { url: './store/shared-2.0.0', dependencies: {} }
packages['client-lib@1.0.0'] = {
  url: pathToFileURL(path.join(appDir, 'store/client-lib-1.0.0')).href,
  dependencies: {},
}
// Not a dependency of any package.
packages['undeclared@1.0.0'] = {
  url: './store/undeclared-1.0.0',
  dependencies: {},
}
Object.assign(packages[appId].dependencies, {
  greeting: 'greeting@1.0.0',
  shared: 'shared@2.0.0',
  'client-lib': 'client-lib@1.0.0',
})

fs.writeFileSync(
  path.join(appDir, 'package-map.json'),
  JSON.stringify({ packages }, null, 2)
)
