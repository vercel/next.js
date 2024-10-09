import path from 'path'
import { stringify } from 'querystring'
import { WEBPACK_RESOURCE_QUERIES } from '../../../../lib/constants'
import { isMetadataRoute } from '../../../../lib/metadata/is-metadata-route'
import type { NextConfig } from '../../../../server/config-shared'
import { AppBundlePathNormalizer } from '../../../../server/normalizers/built/app/app-bundle-path-normalizer'
import { AppPathnameNormalizer } from '../../../../server/normalizers/built/app/app-pathname-normalizer'
import { loadEntrypoint } from '../../../load-entrypoint'
import type { PageExtensions } from '../../../page-extensions-type'
import { getFilenameAndExtension } from '../next-metadata-route-loader'
import { createImportDeclarations } from './create-import-declarations'

export interface CreateAppRouteCodeOptions {
  name: string
  page: string
  pagePath: string
  resolver: PathResolver
  resolveAppRoute: PathResolver
  createRelativePath: (absolutePath: string) => string
  pageExtensions: PageExtensions
  nextConfigOutput: NextConfig['output']
  enableInterceptors: boolean
  useEarlyImport: boolean
}

type ComplementaryAppRouteModule = [
  varName: string,
  filePath: string,
  relativeFilePath: string,
]

interface ComplementaryAppRouteModules {
  interceptors: ComplementaryAppRouteModule[]
}

type PathResolver = (
  pathname: string
) => Promise<string | undefined> | string | undefined

export async function createAppRouteCode({
  name,
  page,
  pagePath,
  resolver,
  resolveAppRoute,
  createRelativePath,
  pageExtensions,
  nextConfigOutput,
  enableInterceptors,
  useEarlyImport,
}: CreateAppRouteCodeOptions): Promise<string> {
  // routePath is the path to the route handler file,
  // but could be aliased e.g. private-next-app-dir/favicon.ico
  const routePath = pagePath.replace(/[\\/]/, '/')

  // This, when used with the resolver will give us the pathname to the built
  // route handler file.
  let resolvedRoutePath = await resolveAppRoute(routePath)
  if (!resolvedRoutePath) {
    throw new Error(
      `Invariant: could not resolve page path for ${name} at ${routePath}`
    )
  }

  const { interceptors } = await collectComplementaryAppRouteModules({
    routePath,
    resolvedRoutePath,
    resolver,
    resolveAppRoute,
    createRelativePath,
    enableInterceptors,
  })

  // If this is a metadata route, then we need to use the metadata loader for
  // the route to ensure that the route is generated.
  const fileBaseName = path.parse(resolvedRoutePath).name
  if (isMetadataRoute(name) && fileBaseName !== 'route') {
    const { ext } = getFilenameAndExtension(resolvedRoutePath)
    const isDynamicRouteExtension = pageExtensions.includes(ext)

    resolvedRoutePath = `next-metadata-route-loader?${stringify({
      filePath: resolvedRoutePath,
      isDynamicRouteExtension: isDynamicRouteExtension ? '1' : '0',
    })}!?${WEBPACK_RESOURCE_QUERIES.metadataRoute}`
  }

  const pathname = new AppPathnameNormalizer().normalize(page)
  const bundlePath = new AppBundlePathNormalizer().normalize(page)

  const code = await loadEntrypoint(
    'app-route',
    {
      VAR_USERLAND: resolvedRoutePath,
      VAR_DEFINITION_PAGE: page,
      VAR_DEFINITION_PATHNAME: pathname,
      VAR_DEFINITION_FILENAME: fileBaseName,
      VAR_DEFINITION_BUNDLE_PATH: bundlePath,
      VAR_RESOLVED_PAGE_PATH: resolvedRoutePath,
    },
    {
      nextConfigOutput: JSON.stringify(nextConfigOutput),
      interceptors: `[${interceptors
        .map(stringifyComplementaryAppRouteModule)
        .join(',\n')}]`,
    }
  )

  const header = createImportDeclarations(interceptors, { useEarlyImport })

  return header + code
}

async function collectComplementaryAppRouteModules({
  routePath,
  resolvedRoutePath,
  resolver,
  resolveAppRoute,
  createRelativePath,
  enableInterceptors,
}: {
  routePath: string
  resolvedRoutePath: string
  resolver: PathResolver
  resolveAppRoute: PathResolver
  createRelativePath: (absolutePath: string) => string
  enableInterceptors: boolean
}): Promise<ComplementaryAppRouteModules> {
  const interceptors: ComplementaryAppRouteModule[] = []

  let currentPath = ''
  let variableCounter = 0

  for (const segment of routePath.split('/')) {
    currentPath = path.posix.join(currentPath, segment)
    let resolvedSegmentPath = await resolveAppRoute(currentPath)

    if (!resolvedSegmentPath || resolvedSegmentPath === resolvedRoutePath) {
      break
    }

    // For now, we're only looking for interceptor files. Other file types (e.g.
    // not-authorized) may be handled here as well in the future.
    if (enableInterceptors) {
      const filePath = await resolver(
        path.posix.join(resolvedSegmentPath, 'interceptor')
      )

      if (filePath) {
        const varName = `interceptor${variableCounter++}`
        interceptors.push([varName, filePath, createRelativePath(filePath)])
      }
    }
  }

  return { interceptors }
}

function stringifyComplementaryAppRouteModule(
  module: ComplementaryAppRouteModule
): string {
  const [varName, filePath, relativeFilePath] = module

  return `[${varName}, ${JSON.stringify(filePath)}, ${JSON.stringify(relativeFilePath)}]`
}
