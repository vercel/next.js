import { existsSync, promises as fs } from 'fs'
import { dirname, join, relative, sep } from 'path'
import {
  RSC_SEGMENTS_DIR_SUFFIX,
  RSC_SEGMENT_SUFFIX,
  RSC_SUFFIX,
} from '../../lib/constants'
import {
  getOutputExportFallbackMetadataPath,
  getOutputExportFallbackPath,
  getOutputExportFallbackStaticPrefix,
  getOutputExportFallbackVariantPath,
} from '../../lib/output-export-dynamic-fallback'
import { normalizePagePath } from '../../shared/lib/page-path/normalize-page-path'
import { getPagePath } from '../../server/require'
import { getSortedRoutes } from '../../shared/lib/router/utils'
import { convertSegmentPathToStaticExportFilename } from '../../shared/lib/segment-cache/segment-value-encoding'

type OutputExportDynamicRouteInfo = {
  fallbackSourceRoute: string | undefined
  fallbackRouteParams:
    | ReadonlyArray<{
        paramName: string
        paramType: string
      }>
    | undefined
}

export type OutputExportFallbackArtifactVariant = {
  route: string
  fallbackPath: string
  orig: string
}

export type OutputExportFallbackArtifactPlan = {
  fallbackRoute: string
  variants: OutputExportFallbackArtifactVariant[]
}

type OutputExportError = Error & {
  code: 'NEXT_EXPORT_ERROR'
}

type CopyExportedAppArtifactsOptions = {
  outDir: string
  orig: string
  routePath: string
  segmentsRoutePath: string
  subFolders: boolean
  checkRouteCollision?: boolean
  routeCollisionPath?: string
}

function createOutputExportError(message: string): OutputExportError {
  const error = new Error(message) as OutputExportError
  error.code = 'NEXT_EXPORT_ERROR'
  return error
}

export async function copyExportedAppArtifacts({
  outDir,
  orig,
  routePath,
  segmentsRoutePath,
  subFolders,
  checkRouteCollision = false,
  routeCollisionPath,
}: CopyExportedAppArtifactsOptions): Promise<string> {
  const route = normalizePagePath(routePath)
  const htmlDest = join(
    outDir,
    `${route}${subFolders && route !== '/index' ? `${sep}index` : ''}.html`
  )
  const jsonDest = join(
    outDir,
    `${route}${subFolders && route !== '/index' ? `${sep}index` : ''}.txt`
  )

  if (checkRouteCollision && (existsSync(htmlDest) || existsSync(jsonDest))) {
    throw createOutputExportError(
      `The route "${routeCollisionPath ?? routePath}" conflicts with the internal "__fallback" path used by dynamic route fallbacks in static export mode. ` +
        `Please rename this route to something else.\n\n` +
        `Learn more: https://nextjs.org/docs/app/guides/static-exports`
    )
  }

  await fs.mkdir(dirname(htmlDest), { recursive: true })
  await fs.mkdir(dirname(jsonDest), { recursive: true })
  await fs.copyFile(`${orig}.html`, htmlDest)
  await fs.copyFile(`${orig}${RSC_SUFFIX}`, jsonDest)

  const segmentsDir = `${orig}${RSC_SEGMENTS_DIR_SUFFIX}`
  if (existsSync(segmentsDir)) {
    const segmentsDirDest = join(outDir, segmentsRoutePath)
    const segmentPaths = await collectSegmentPaths(segmentsDir)
    await Promise.all(
      segmentPaths.map(async (segmentFileSrc) => {
        const segmentPath =
          '/' + segmentFileSrc.slice(0, -RSC_SEGMENT_SUFFIX.length)
        const segmentFilename =
          convertSegmentPathToStaticExportFilename(segmentPath)
        const segmentFileDest = join(segmentsDirDest, segmentFilename)
        await fs.mkdir(dirname(segmentFileDest), { recursive: true })
        await fs.copyFile(join(segmentsDir, segmentFileSrc), segmentFileDest)
      })
    )
  }

  return htmlDest
}

export function planOutputExportFallbackArtifacts(
  dynamicRoutes: Readonly<Record<string, OutputExportDynamicRouteInfo>>,
  mapAppRouteToPage: Map<string, string>,
  distDir: string
): OutputExportFallbackArtifactPlan[] {
  const fallbackEntriesByRoute = new Map<
    string,
    Array<{
      dynamicRoute: string
      orig: string
    }>
  >()

  for (const [dynamicRoute, prerenderInfo] of Object.entries(dynamicRoutes)) {
    if (
      !prerenderInfo.fallbackSourceRoute ||
      !prerenderInfo.fallbackRouteParams ||
      prerenderInfo.fallbackRouteParams.length === 0
    ) {
      continue
    }

    const staticPrefix = getOutputExportFallbackStaticPrefix(dynamicRoute)
    if (staticPrefix === null) {
      continue
    }

    const appPageName = mapAppRouteToPage.get(prerenderInfo.fallbackSourceRoute)
    if (!appPageName) {
      continue
    }

    const pagePath = getPagePath(appPageName, distDir, undefined, true)
    const distPagesDir = join(
      pagePath,
      appPageName
        .slice(1)
        .split('/')
        .map(() => '..')
        .join('/')
    )

    const sourceRoute = normalizePagePath(dynamicRoute)
    const orig = join(distPagesDir, sourceRoute)
    if (!existsSync(`${orig}.html`) || !existsSync(`${orig}${RSC_SUFFIX}`)) {
      continue
    }

    const fallbackRoute = getOutputExportFallbackPath(staticPrefix)
    const entries = fallbackEntriesByRoute.get(fallbackRoute)
    const entry = { dynamicRoute, orig }
    if (entries) {
      entries.push(entry)
    } else {
      fallbackEntriesByRoute.set(fallbackRoute, [entry])
    }
  }

  return Array.from(fallbackEntriesByRoute.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([fallbackRoute, entries]) => {
      if (entries.length === 1) {
        return {
          fallbackRoute,
          variants: [
            {
              route: entries[0].dynamicRoute,
              fallbackPath: fallbackRoute,
              orig: entries[0].orig,
            },
          ],
        }
      }

      const sortedDynamicRoutes = getSortedRoutes(
        entries.map((entry) => entry.dynamicRoute)
      )
      const entriesByDynamicRoute = new Map(
        entries.map((entry) => [entry.dynamicRoute, entry])
      )
      const variants = sortedDynamicRoutes.map((dynamicRoute, index) => {
        const entry = entriesByDynamicRoute.get(dynamicRoute)!
        return {
          route: entry.dynamicRoute,
          fallbackPath: getOutputExportFallbackVariantPath(
            fallbackRoute,
            index
          ),
          orig: entry.orig,
        }
      })

      return {
        fallbackRoute,
        variants,
      }
    })
}

export async function emitOutputExportFallbackArtifacts(
  plans: OutputExportFallbackArtifactPlan[],
  outDir: string,
  subFolders: boolean
): Promise<string[]> {
  const fallbackHtmlPathsByPlan = await Promise.all(
    plans.map(async ({ fallbackRoute, variants }) => {
      if (variants.length > 1) {
        const manifestPath = join(
          outDir,
          getOutputExportFallbackMetadataPath(fallbackRoute)
        )
        await fs.mkdir(dirname(manifestPath), { recursive: true })
        await fs.writeFile(
          manifestPath,
          JSON.stringify(
            {
              version: 1,
              routes: variants.map(({ route, fallbackPath }) => ({
                route,
                fallbackPath,
              })),
            },
            null,
            2
          )
        )
      }

      return Promise.all(
        variants.map(async ({ fallbackPath, orig }) => {
          return copyExportedAppArtifacts({
            outDir,
            orig,
            routePath: fallbackPath,
            segmentsRoutePath: fallbackPath,
            subFolders,
            checkRouteCollision: variants.length === 1,
            routeCollisionPath: fallbackRoute,
          })
        })
      )
    })
  )

  return fallbackHtmlPathsByPlan.flat()
}

export async function writeOutputExportFallbackHtml(
  outDir: string,
  fallbackHtmlPaths: string[]
): Promise<void> {
  // Prefer a shallow __fallback shell for the global fallback entry point so
  // the bootstrap document still carries the right root structure and assets.
  // Fall back to a generic document only if no __fallback shell exists.
  const genericSource = [
    join(outDir, 'index.html'),
    join(outDir, '404.html'),
  ].find((candidate) => existsSync(candidate))

  const sortedFallbackPaths = [...fallbackHtmlPaths].sort(
    (a, b) => a.length - b.length
  )
  const pprShellSource = sortedFallbackPaths[0]
  const fallbackSource = pprShellSource ?? genericSource
  if (!fallbackSource) {
    return
  }

  const fallbackHtml = await fs.readFile(fallbackSource, 'utf8')
  const exportFallbackScript = '<script>self.__NEXT_EXPORT_FALLBACK=1</script>'
  // The global fallback document is only a bootstrap shell. Keep it hidden
  // until the client resolves the actual route-specific fallback payload and
  // React commits the real tree. Removed in app-index.tsx after hydration.
  const exportFallbackStyle =
    '<style id="__next-export-fallback-style">#__next{visibility:hidden}</style>'
  const injection = `${exportFallbackStyle}${exportFallbackScript}`

  const patchedFallbackHtml = fallbackHtml.includes('<head>')
    ? fallbackHtml.replace('<head>', `<head>${injection}`)
    : fallbackHtml.includes('</head>')
      ? fallbackHtml.replace('</head>', `${injection}</head>`)
      : injection + fallbackHtml

  await fs.writeFile(join(outDir, '_fallback.html'), patchedFallbackHtml)
}

async function collectSegmentPaths(segmentsDirectory: string) {
  const results: Array<string> = []
  await collectSegmentPathsImpl(segmentsDirectory, segmentsDirectory, results)
  return results
}

async function collectSegmentPathsImpl(
  segmentsDirectory: string,
  directory: string,
  results: Array<string>
) {
  const segmentFiles = await fs.readdir(directory, {
    withFileTypes: true,
  })
  await Promise.all(
    segmentFiles.map(async (segmentFile) => {
      if (segmentFile.isDirectory()) {
        await collectSegmentPathsImpl(
          segmentsDirectory,
          join(directory, segmentFile.name),
          results
        )
        return
      }
      if (!segmentFile.name.endsWith(RSC_SEGMENT_SUFFIX)) {
        return
      }
      results.push(
        relative(segmentsDirectory, join(directory, segmentFile.name))
      )
    })
  )
}
