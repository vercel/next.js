import { isAbsolute, relative, sep } from 'path'
import type { BrowserFixtureHost } from '../../experimental/testing/contracts'

/** The private registration describes real compiler entries, never HTTP module paths. */
export function browserFixturePages(host: BrowserFixtureHost | undefined) {
  if (!host) return []
  if (
    !/^\/__next_testing_[a-zA-Z0-9_-]+$/.test(host.routePrefix) ||
    !host.fixtures.length
  )
    throw new Error('Invalid private browser fixture host registration')
  const ids = new Set<string>()
  return host.fixtures.map((fixture) => {
    if (
      !/^[a-zA-Z0-9_-]+$/.test(fixture.id) ||
      ids.has(fixture.id) ||
      !/^[$A-Z_a-z][$\w]*$/.test(fixture.exportName)
    )
      throw new Error('Invalid or duplicate registered browser fixture')
    ids.add(fixture.id)
    const pathname = `${host.routePrefix}/${fixture.id}`
    return { pathname, originalName: `${pathname}/page` }
  })
}

export function serializeBrowserFixtureHost(
  projectDir: string,
  host: BrowserFixtureHost
) {
  browserFixturePages(host)
  function modulePath(file: string, label: string) {
    const value = relative(projectDir, file)
    if (
      !isAbsolute(file) ||
      !value ||
      isAbsolute(value) ||
      value === '..' ||
      value.startsWith(`..${sep}`)
    )
      throw new Error(
        `Browser fixture ${label} must be contained in the application project`
      )
    return value.split(sep).join('/')
  }
  return JSON.stringify({
    routePrefix: host.routePrefix,
    fixtures: host.fixtures.map((fixture) => ({
      ...fixture,
      module: modulePath(fixture.module, 'modules'),
      ...(fixture.layout === undefined
        ? {}
        : { layout: modulePath(fixture.layout, 'layouts') }),
    })),
  })
}

export function browserFixtureManifestFiles(
  host: BrowserFixtureHost | undefined
): string[] {
  if (!host) return []
  return [
    'server/app-paths-manifest.json',
    'app-path-routes-manifest.json',
    ...browserFixturePages(host).flatMap(({ originalName }) => [
      `server/app${originalName}_client-reference-manifest.js`,
      `server/app${originalName}.js.nft.json`,
    ]),
  ]
}

/** Old native ProjectOptions may silently ignore private registration fields. */
export function requireProductionFixtureCapability(
  binding: { projectBrowserFixtureProductionVersion?: () => number },
  requested: boolean
) {
  if (!requested) return
  const version = binding.projectBrowserFixtureProductionVersion?.()
  if (!Number.isSafeInteger(version) || version! < 1)
    throw new Error(
      'The installed Turbopack binding does not support production browser fixture pages'
    )
}
