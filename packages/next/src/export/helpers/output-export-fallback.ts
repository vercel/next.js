import { existsSync, promises as fs } from 'fs'
import { dirname, join, relative, sep } from 'path'
import {
  RSC_SEGMENTS_DIR_SUFFIX,
  RSC_SEGMENT_SUFFIX,
  RSC_SUFFIX,
} from '../../lib/constants'
import { getPagePath } from '../../server/require'
import { convertSegmentPathToStaticExportFilename } from '../../shared/lib/segment-cache/segment-value-encoding'
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

type CopyExportedAppArtifactsOptions = {
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

export async function copyExportedAppArtifacts({
  outDir,
  orig,
  routePath,
  subFolders,
  checkRouteCollision = false,
}: CopyExportedAppArtifactsOptions): Promise<string> {
  const route = normalizePagePath(routePath)
  const flatHtmlDest = join(outDir, `${route}.html`)
  const flatJsonDest = join(outDir, `${route}.txt`)
  const folderHtmlDest = join(
    outDir,
    `${route}${route !== '/index' ? `${sep}index` : ''}.html`
  )
  const folderJsonDest = join(
    outDir,
    `${route}${route !== '/index' ? `${sep}index` : ''}.txt`
  )
  const htmlDest =
    subFolders && route !== '/index' ? folderHtmlDest : flatHtmlDest
  const jsonDest =
    subFolders && route !== '/index' ? folderJsonDest : flatJsonDest

  const segmentsDir = `${orig}${RSC_SEGMENTS_DIR_SUFFIX}`
  const segmentCopies: Array<{
    src: string
    dest: string
  }> = []

  if (existsSync(segmentsDir)) {
    const segmentsDirDest = join(outDir, routePath)
    const segmentPaths = await collectSegmentPaths(segmentsDir)
    for (const segmentFileSrc of segmentPaths) {
      const segmentPath =
        '/' + segmentFileSrc.slice(0, -RSC_SEGMENT_SUFFIX.length)
      const segmentFilename =
        convertSegmentPathToStaticExportFilename(segmentPath)
      segmentCopies.push({
        src: join(segmentsDir, segmentFileSrc),
        dest: join(segmentsDirDest, segmentFilename),
      })
    }
  }

  if (checkRouteCollision) {
    assertNoOutputExportPathCollision(
      outDir,
      [
        flatHtmlDest,
        flatJsonDest,
        folderHtmlDest,
        folderJsonDest,
        ...segmentCopies.map(({ dest }) => dest),
      ],
      routePath
    )
  }

  await fs.mkdir(dirname(htmlDest), { recursive: true })
  await fs.mkdir(dirname(jsonDest), { recursive: true })
  await fs.copyFile(`${orig}.html`, htmlDest)
  await fs.copyFile(`${orig}${RSC_SUFFIX}`, jsonDest)

  await Promise.all(
    segmentCopies.map(async ({ src, dest }) => {
      await fs.mkdir(dirname(dest), { recursive: true })
      await fs.copyFile(src, dest)
    })
  )

  return htmlDest
}

export async function emitOutputExportFallbackArtifacts(
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
    if (!existsSync(`${orig}.html`) || !existsSync(`${orig}${RSC_SUFFIX}`)) {
      continue
    }

    const fallbackPath = getOutputExportFallbackPath(staticPrefix)
    fallbackHtmlPaths.push(
      await copyExportedAppArtifacts({
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
