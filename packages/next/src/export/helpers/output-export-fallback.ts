import { existsSync, promises as fs } from 'fs'
import { dirname, join, relative, sep } from 'path'
import { getPagePath } from '../../server/require'
import { normalizePagePath } from '../../shared/lib/page-path/normalize-page-path'
import {
  getOutputExportFallbackPath,
  getOutputExportFallbackStaticPrefix,
} from '../../lib/output-export-dynamic-fallback'

type OutputExportDynamicRouteInfo = {
  fallbackSourceRoute: string | undefined
  fallbackRouteParams:
    | ReadonlyArray<{
        paramName: string
        paramType: string
      }>
    | undefined
}

type CopyExportedAppHtmlOptions = {
  outDir: string
  orig: string
  routePath: string
  subFolders: boolean
  checkRouteCollision?: boolean
}

type OutputExportError = Error & {
  code: 'NEXT_EXPORT_ERROR'
}

function createOutputExportError(message: string): OutputExportError {
  const error = new Error(message) as OutputExportError
  error.code = 'NEXT_EXPORT_ERROR'
  return error
}

function formatOutputPath(outDir: string, filePath: string): string {
  return `/${relative(outDir, filePath).split(sep).join('/')}`
}

function assertNoOutputExportPathCollision(
  outDir: string,
  filePaths: string[],
  routePath: string
): void {
  const collisionPath = filePaths.find((filePath) => existsSync(filePath))
  if (!collisionPath) {
    return
  }

  throw createOutputExportError(
    `The route "${routePath}" conflicts with the internal "__fallback" path used by dynamic route fallbacks in static export mode at "${formatOutputPath(
      outDir,
      collisionPath
    )}". ` +
      `Please rename this route or public file to something else.\n\n` +
      `Learn more: https://nextjs.org/docs/app/guides/static-exports`
  )
}

export async function copyExportedAppHtml({
  outDir,
  orig,
  routePath,
  subFolders,
  checkRouteCollision = false,
}: CopyExportedAppHtmlOptions): Promise<string> {
  const route = normalizePagePath(routePath)
  const flatHtmlDest = join(outDir, `${route}.html`)
  const folderHtmlDest = join(
    outDir,
    `${route}${route !== '/index' ? `${sep}index` : ''}.html`
  )
  const htmlDest =
    subFolders && route !== '/index' ? folderHtmlDest : flatHtmlDest

  if (checkRouteCollision) {
    assertNoOutputExportPathCollision(
      outDir,
      [flatHtmlDest, folderHtmlDest],
      routePath
    )
  }

  await fs.mkdir(dirname(htmlDest), { recursive: true })
  await fs.copyFile(`${orig}.html`, htmlDest)

  return htmlDest
}

export async function emitOutputExportFallbackHtmlFiles(
  dynamicRoutes: Readonly<Record<string, OutputExportDynamicRouteInfo>>,
  mapAppRouteToPage: Map<string, string>,
  distDir: string,
  outDir: string,
  subFolders: boolean
): Promise<string[]> {
  const fallbackHtmlPaths: string[] = []

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
    if (!existsSync(`${orig}.html`)) {
      continue
    }

    const fallbackPath = getOutputExportFallbackPath(staticPrefix)
    fallbackHtmlPaths.push(
      await copyExportedAppHtml({
        outDir,
        orig,
        routePath: fallbackPath,
        subFolders,
        checkRouteCollision: true,
      })
    )
  }

  return fallbackHtmlPaths
}
