import '../next-server/server/node-polyfill-fetch'
import chalk from 'next/dist/compiled/chalk'
import gzipSize from 'next/dist/compiled/gzip-size'
import textTable from 'next/dist/compiled/text-table'
import path from 'path'
import { isValidElementType } from 'react-is'
import stripAnsi from 'next/dist/compiled/strip-ansi'
import {
  Redirect,
  Rewrite,
  Header,
  CustomRoutes,
} from '../lib/load-custom-routes'
import {
  SSG_GET_INITIAL_PROPS_CONFLICT,
  SERVER_PROPS_GET_INIT_PROPS_CONFLICT,
  SERVER_PROPS_SSG_CONFLICT,
} from '../lib/constants'
import prettyBytes from '../lib/pretty-bytes'
import { recursiveReadDir } from '../lib/recursive-readdir'
import { getRouteMatcher, getRouteRegex } from '../next-server/lib/router/utils'
import { isDynamicRoute } from '../next-server/lib/router/utils/is-dynamic'
import escapePathDelimiters from '../next-server/lib/router/utils/escape-path-delimiters'
import { findPageFile } from '../server/lib/find-page-file'
import { GetStaticPaths } from 'next/types'
import { denormalizePagePath } from '../next-server/server/normalize-page-path'
import { BuildManifest } from '../next-server/server/get-page-files'
import { removePathTrailingSlash } from '../client/normalize-trailing-slash'

const fileGzipStats: { [k: string]: Promise<number> } = {}
const fsStatGzip = (file: string) => {
  if (fileGzipStats[file]) return fileGzipStats[file]
  fileGzipStats[file] = gzipSize.file(file)
  return fileGzipStats[file]
}

export function collectPages(
  directory: string,
  pageExtensions: string[]
): Promise<string[]> {
  return recursiveReadDir(
    directory,
    new RegExp(`\\.(?:${pageExtensions.join('|')})$`)
  )
}

export interface PageInfo {
  isHybridAmp?: boolean
  size: number
  totalSize: number
  static: boolean
  isSsg: boolean
  ssgPageRoutes: string[] | null
  hasSsgFallback: boolean
  initialRevalidateSeconds: number | false
}

export async function printTreeView(
  list: readonly string[],
  pageInfos: Map<string, PageInfo>,
  serverless: boolean,
  {
    distPath,
    buildId,
    pagesDir,
    pageExtensions,
    buildManifest,
    isModern,
    useStatic404,
  }: {
    distPath: string
    buildId: string
    pagesDir: string
    pageExtensions: string[]
    buildManifest: BuildManifest
    isModern: boolean
    useStatic404: boolean
  }
) {
  const getPrettySize = (_size: number): string => {
    const size = prettyBytes(_size)
    // green for 0-130kb
    if (_size < 130 * 1000) return chalk.green(size)
    // yellow for 130-170kb
    if (_size < 170 * 1000) return chalk.yellow(size)
    // red for >= 170kb
    return chalk.red.bold(size)
  }

  const getCleanName = (fileName: string) =>
    fileName
      // Trim off `static/`
      .replace(/^static\//, '')
      // Re-add `static/` for root files
      .replace(/^<buildId>/, 'static')
      // Remove file hash
      .replace(/[.-]([0-9a-z]{6})[0-9a-z]{14}(?=\.)/, '.$1')

  const messages: [string, string, string][] = [
    ['Page', 'Size', 'First Load JS'].map((entry) =>
      chalk.underline(entry)
    ) as [string, string, string],
  ]

  const hasCustomApp = await findPageFile(pagesDir, '/_app', pageExtensions)

  pageInfos.set('/404', {
    ...(pageInfos.get('/404') || pageInfos.get('/_error')),
    static: useStatic404,
  } as any)

  if (!list.includes('/404')) {
    list = [...list, '/404']
  }

  const sizeData = await computeFromManifest(
    buildManifest,
    distPath,
    isModern,
    pageInfos
  )

  const pageList = list
    .slice()
    .filter(
      (e) =>
        !(
          e === '/_document' ||
          e === '/_error' ||
          (!hasCustomApp && e === '/_app')
        )
    )
    .sort((a, b) => a.localeCompare(b))

  pageList.forEach((item, i, arr) => {
    const symbol =
      i === 0
        ? arr.length === 1
          ? '─'
          : '┌'
        : i === arr.length - 1
        ? '└'
        : '├'

    const pageInfo = pageInfos.get(item)
    const ampFirst = buildManifest.ampFirstPages.includes(item)

    messages.push([
      `${symbol} ${
        item === '/_app'
          ? ' '
          : pageInfo?.static
          ? '○'
          : pageInfo?.isSsg
          ? '●'
          : 'λ'
      } ${
        pageInfo?.initialRevalidateSeconds
          ? `${item} (ISR: ${pageInfo?.initialRevalidateSeconds} Seconds)`
          : item
      }`,
      pageInfo
        ? ampFirst
          ? chalk.cyan('AMP')
          : pageInfo.size >= 0
          ? prettyBytes(pageInfo.size)
          : ''
        : '',
      pageInfo
        ? ampFirst
          ? chalk.cyan('AMP')
          : pageInfo.size >= 0
          ? getPrettySize(pageInfo.totalSize)
          : ''
        : '',
    ])

    const uniqueCssFiles =
      buildManifest.pages[item]?.filter(
        (file) => file.endsWith('.css') && sizeData.uniqueFiles.includes(file)
      ) || []

    if (uniqueCssFiles.length > 0) {
      const contSymbol = i === arr.length - 1 ? ' ' : '├'

      uniqueCssFiles.forEach((file, index, { length }) => {
        const innerSymbol = index === length - 1 ? '└' : '├'
        messages.push([
          `${contSymbol}   ${innerSymbol} ${getCleanName(file)}`,
          prettyBytes(sizeData.sizeUniqueFiles[file]),
          '',
        ])
      })
    }

    if (pageInfo?.ssgPageRoutes?.length) {
      const totalRoutes = pageInfo.ssgPageRoutes.length
      const previewPages = totalRoutes === 4 ? 4 : 3
      const contSymbol = i === arr.length - 1 ? ' ' : '├'

      const routes = pageInfo.ssgPageRoutes.slice(0, previewPages)
      if (totalRoutes > previewPages) {
        const remaining = totalRoutes - previewPages
        routes.push(`[+${remaining} more paths]`)
      }

      routes.forEach((slug, index, { length }) => {
        const innerSymbol = index === length - 1 ? '└' : '├'
        messages.push([`${contSymbol}   ${innerSymbol} ${slug}`, '', ''])
      })
    }
  })

  const sharedFilesSize = sizeData.sizeCommonFiles
  const sharedFiles = sizeData.sizeCommonFile

  messages.push([
    '+ First Load JS shared by all',
    getPrettySize(sharedFilesSize),
    '',
  ])
  const sharedFileKeys = Object.keys(sharedFiles)
  const sharedCssFiles: string[] = []
  ;[
    ...sharedFileKeys
      .filter((file) => {
        if (file.endsWith('.css')) {
          sharedCssFiles.push(file)
          return false
        }
        return true
      })
      .map((e) => e.replace(buildId, '<buildId>'))
      .sort(),
    ...sharedCssFiles.map((e) => e.replace(buildId, '<buildId>')).sort(),
  ].forEach((fileName, index, { length }) => {
    const innerSymbol = index === length - 1 ? '└' : '├'

    const originalName = fileName.replace('<buildId>', buildId)
    const cleanName = getCleanName(fileName)

    messages.push([
      `  ${innerSymbol} ${cleanName}`,
      prettyBytes(sharedFiles[originalName]),
      '',
    ])
  })

  console.log(
    textTable(messages, {
      align: ['l', 'l', 'r'],
      stringLength: (str) => stripAnsi(str).length,
    })
  )

  console.log()
  console.log(
    textTable(
      [
        [
          'λ',
          serverless ? '(Lambda)' : '(Server)',
          `server-side renders at runtime (uses ${chalk.cyan(
            'getInitialProps'
          )} or ${chalk.cyan('getServerSideProps')})`,
        ],
        [
          '○',
          '(Static)',
          'automatically rendered as static HTML (uses no initial props)',
        ],
        [
          '●',
          '(SSG)',
          `automatically generated as static HTML + JSON (uses ${chalk.cyan(
            'getStaticProps'
          )})`,
        ],
        [
          '',
          '(ISR)',
          `incremental static regeneration (uses revalidate in ${chalk.cyan(
            'getStaticProps'
          )})`,
        ],
      ] as [string, string, string][],
      {
        align: ['l', 'l', 'l'],
        stringLength: (str) => stripAnsi(str).length,
      }
    )
  )

  console.log()
}

export function printCustomRoutes({
  redirects,
  rewrites,
  headers,
}: CustomRoutes) {
  const printRoutes = (
    routes: Redirect[] | Rewrite[] | Header[],
    type: 'Redirects' | 'Rewrites' | 'Headers'
  ) => {
    const isRedirects = type === 'Redirects'
    const isHeaders = type === 'Headers'
    console.log(chalk.underline(type))
    console.log()

    /*
        ┌ source
        ├ permanent/statusCode
        └ destination
     */
    const routesStr = (routes as any[])
      .map((route: { source: string }) => {
        let routeStr = `┌ source: ${route.source}\n`

        if (!isHeaders) {
          const r = route as Rewrite
          routeStr += `${isRedirects ? '├' : '└'} destination: ${
            r.destination
          }\n`
        }
        if (isRedirects) {
          const r = route as Redirect
          routeStr += `└ ${
            r.statusCode
              ? `status: ${r.statusCode}`
              : `permanent: ${r.permanent}`
          }\n`
        }

        if (isHeaders) {
          const r = route as Header
          routeStr += `└ headers:\n`

          for (let i = 0; i < r.headers.length; i++) {
            const header = r.headers[i]
            const last = i === headers.length - 1

            routeStr += `  ${last ? '└' : '├'} ${header.key}: ${header.value}\n`
          }
        }

        return routeStr
      })
      .join('\n')

    console.log(routesStr, '\n')
  }

  if (redirects.length) {
    printRoutes(redirects, 'Redirects')
  }
  if (rewrites.length) {
    printRoutes(rewrites, 'Rewrites')
  }
  if (headers.length) {
    printRoutes(headers, 'Headers')
  }
}

type ComputeManifestShape = {
  commonFiles: string[]
  uniqueFiles: string[]
  sizeUniqueFiles: { [file: string]: number }
  sizeCommonFile: { [file: string]: number }
  sizeCommonFiles: number
}

let cachedBuildManifest: BuildManifest | undefined

let lastCompute: ComputeManifestShape | undefined
let lastComputeModern: boolean | undefined
let lastComputePageInfo: boolean | undefined

async function computeFromManifest(
  manifest: BuildManifest,
  distPath: string,
  isModern: boolean,
  pageInfos?: Map<string, PageInfo>
): Promise<ComputeManifestShape> {
  if (
    Object.is(cachedBuildManifest, manifest) &&
    lastComputeModern === isModern &&
    lastComputePageInfo === !!pageInfos
  ) {
    return lastCompute!
  }

  let expected = 0
  const files = new Map<string, number>()
  Object.keys(manifest.pages).forEach((key) => {
    if (pageInfos) {
      const pageInfo = pageInfos.get(key)
      // don't include AMP pages since they don't rely on shared bundles
      // AMP First pages are not under the pageInfos key
      if (pageInfo?.isHybridAmp) {
        return
      }
    }

    ++expected
    manifest.pages[key].forEach((file) => {
      if (
        // Select Modern or Legacy scripts
        file.endsWith('.module.js') !== isModern
      ) {
        return
      }

      if (key === '/_app') {
        files.set(file, Infinity)
      } else if (files.has(file)) {
        files.set(file, files.get(file)! + 1)
      } else {
        files.set(file, 1)
      }
    })
  })

  const commonFiles = [...files.entries()]
    .filter(([, len]) => len === expected || len === Infinity)
    .map(([f]) => f)
  const uniqueFiles = [...files.entries()]
    .filter(([, len]) => len === 1)
    .map(([f]) => f)

  let stats: [string, number][]
  try {
    stats = await Promise.all(
      commonFiles.map(
        async (f) =>
          [f, await fsStatGzip(path.join(distPath, f))] as [string, number]
      )
    )
  } catch (_) {
    stats = []
  }

  let uniqueStats: [string, number][]
  try {
    uniqueStats = await Promise.all(
      uniqueFiles.map(
        async (f) =>
          [f, await fsStatGzip(path.join(distPath, f))] as [string, number]
      )
    )
  } catch (_) {
    uniqueStats = []
  }

  lastCompute = {
    commonFiles,
    uniqueFiles,
    sizeUniqueFiles: uniqueStats.reduce(
      (obj, n) => Object.assign(obj, { [n[0]]: n[1] }),
      {}
    ),
    sizeCommonFile: stats.reduce(
      (obj, n) => Object.assign(obj, { [n[0]]: n[1] }),
      {}
    ),
    sizeCommonFiles: stats.reduce((size, [f, stat]) => {
      if (f.endsWith('.css')) return size
      return size + stat
    }, 0),
  }

  cachedBuildManifest = manifest
  lastComputeModern = isModern
  lastComputePageInfo = !!pageInfos
  return lastCompute!
}

function difference<T>(main: T[], sub: T[]): T[] {
  const a = new Set(main)
  const b = new Set(sub)
  return [...a].filter((x) => !b.has(x))
}

function intersect<T>(main: T[], sub: T[]): T[] {
  const a = new Set(main)
  const b = new Set(sub)
  return [...new Set([...a].filter((x) => b.has(x)))]
}

function sum(a: number[]): number {
  return a.reduce((size, stat) => size + stat, 0)
}

export async function getJsPageSizeInKb(
  page: string,
  distPath: string,
  buildManifest: BuildManifest,
  isModern: boolean
): Promise<[number, number]> {
  const data = await computeFromManifest(buildManifest, distPath, isModern)

  const fnFilterModern = (entry: string) =>
    entry.endsWith('.js') && entry.endsWith('.module.js') === isModern

  const pageFiles = (
    buildManifest.pages[denormalizePagePath(page)] || []
  ).filter(fnFilterModern)
  const appFiles = (buildManifest.pages['/_app'] || []).filter(fnFilterModern)

  const fnMapRealPath = (dep: string) => `${distPath}/${dep}`

  const allFilesReal = [...new Set([...pageFiles, ...appFiles])].map(
    fnMapRealPath
  )
  const selfFilesReal = difference(
    intersect(pageFiles, data.uniqueFiles),
    data.commonFiles
  ).map(fnMapRealPath)

  try {
    // Doesn't use `Promise.all`, as we'd double compute duplicate files. This
    // function is memoized, so the second one will instantly resolve.
    const allFilesSize = sum(await Promise.all(allFilesReal.map(fsStatGzip)))
    const selfFilesSize = sum(await Promise.all(selfFilesReal.map(fsStatGzip)))

    return [selfFilesSize, allFilesSize]
  } catch (_) {}
  return [-1, -1]
}

export async function buildStaticPaths(
  page: string,
  getStaticPaths: GetStaticPaths
): Promise<{ paths: string[]; fallback: boolean }> {
  const prerenderPaths = new Set<string>()
  const _routeRegex = getRouteRegex(page)
  const _routeMatcher = getRouteMatcher(_routeRegex)

  // Get the default list of allowed params.
  const _validParamKeys = Object.keys(_routeMatcher(page))

  const staticPathsResult = await getStaticPaths()

  const expectedReturnVal =
    `Expected: { paths: [], fallback: boolean }\n` +
    `See here for more info: https://err.sh/vercel/next.js/invalid-getstaticpaths-value`

  if (
    !staticPathsResult ||
    typeof staticPathsResult !== 'object' ||
    Array.isArray(staticPathsResult)
  ) {
    throw new Error(
      `Invalid value returned from getStaticPaths in ${page}. Received ${typeof staticPathsResult} ${expectedReturnVal}`
    )
  }

  const invalidStaticPathKeys = Object.keys(staticPathsResult).filter(
    (key) => !(key === 'paths' || key === 'fallback')
  )

  if (invalidStaticPathKeys.length > 0) {
    throw new Error(
      `Extra keys returned from getStaticPaths in ${page} (${invalidStaticPathKeys.join(
        ', '
      )}) ${expectedReturnVal}`
    )
  }

  if (typeof staticPathsResult.fallback !== 'boolean') {
    throw new Error(
      `The \`fallback\` key must be returned from getStaticPaths in ${page}.\n` +
        expectedReturnVal
    )
  }

  const toPrerender = staticPathsResult.paths

  if (!Array.isArray(toPrerender)) {
    throw new Error(
      `Invalid \`paths\` value returned from getStaticProps in ${page}.\n` +
        `\`paths\` must be an array of strings or objects of shape { params: [key: string]: string }`
    )
  }

  toPrerender.forEach((entry) => {
    // For a string-provided path, we must make sure it matches the dynamic
    // route.
    if (typeof entry === 'string') {
      entry = removePathTrailingSlash(entry)
      const result = _routeMatcher(entry)
      if (!result) {
        throw new Error(
          `The provided path \`${entry}\` does not match the page: \`${page}\`.`
        )
      }

      prerenderPaths?.add(entry)
    }
    // For the object-provided path, we must make sure it specifies all
    // required keys.
    else {
      const invalidKeys = Object.keys(entry).filter((key) => key !== 'params')
      if (invalidKeys.length) {
        throw new Error(
          `Additional keys were returned from \`getStaticPaths\` in page "${page}". ` +
            `URL Parameters intended for this dynamic route must be nested under the \`params\` key, i.e.:` +
            `\n\n\treturn { params: { ${_validParamKeys
              .map((k) => `${k}: ...`)
              .join(', ')} } }` +
            `\n\nKeys that need to be moved: ${invalidKeys.join(', ')}.\n`
        )
      }

      const { params = {} } = entry
      let builtPage = page
      _validParamKeys.forEach((validParamKey) => {
        const { repeat, optional } = _routeRegex.groups[validParamKey]
        let paramValue = params[validParamKey]
        if (
          optional &&
          params.hasOwnProperty(validParamKey) &&
          (paramValue === null ||
            paramValue === undefined ||
            (paramValue as any) === false)
        ) {
          paramValue = []
        }
        if (
          (repeat && !Array.isArray(paramValue)) ||
          (!repeat && typeof paramValue !== 'string')
        ) {
          throw new Error(
            `A required parameter (${validParamKey}) was not provided as ${
              repeat ? 'an array' : 'a string'
            } in getStaticPaths for ${page}`
          )
        }
        let replaced = `[${repeat ? '...' : ''}${validParamKey}]`
        if (optional) {
          replaced = `[${replaced}]`
        }
        builtPage = builtPage
          .replace(
            replaced,
            repeat
              ? (paramValue as string[]).map(escapePathDelimiters).join('/')
              : escapePathDelimiters(paramValue as string)
          )
          .replace(/(?!^)\/$/, '')
      })

      prerenderPaths?.add(builtPage)
    }
  })

  return { paths: [...prerenderPaths], fallback: staticPathsResult.fallback }
}

export async function isPageStatic(
  page: string,
  serverBundle: string,
  runtimeEnvConfig: any
): Promise<{
  isStatic?: boolean
  isAmpOnly?: boolean
  isHybridAmp?: boolean
  hasServerProps?: boolean
  hasStaticProps?: boolean
  prerenderRoutes?: string[] | undefined
  prerenderFallback?: boolean | undefined
}> {
  try {
    require('../next-server/lib/runtime-config').setConfig(runtimeEnvConfig)
    const mod = require(serverBundle)
    const Comp = mod.default || mod

    if (!Comp || !isValidElementType(Comp) || typeof Comp === 'string') {
      throw new Error('INVALID_DEFAULT_EXPORT')
    }

    const hasGetInitialProps = !!(Comp as any).getInitialProps
    const hasStaticProps = !!mod.getStaticProps
    const hasStaticPaths = !!mod.getStaticPaths
    const hasServerProps = !!mod.getServerSideProps
    const hasLegacyServerProps = !!mod.unstable_getServerProps
    const hasLegacyStaticProps = !!mod.unstable_getStaticProps
    const hasLegacyStaticPaths = !!mod.unstable_getStaticPaths
    const hasLegacyStaticParams = !!mod.unstable_getStaticParams

    if (hasLegacyStaticParams) {
      throw new Error(
        `unstable_getStaticParams was replaced with getStaticPaths. Please update your code.`
      )
    }

    if (hasLegacyStaticPaths) {
      throw new Error(
        `unstable_getStaticPaths was replaced with getStaticPaths. Please update your code.`
      )
    }

    if (hasLegacyStaticProps) {
      throw new Error(
        `unstable_getStaticProps was replaced with getStaticProps. Please update your code.`
      )
    }

    if (hasLegacyServerProps) {
      throw new Error(
        `unstable_getServerProps was replaced with getServerSideProps. Please update your code.`
      )
    }

    // A page cannot be prerendered _and_ define a data requirement. That's
    // contradictory!
    if (hasGetInitialProps && hasStaticProps) {
      throw new Error(SSG_GET_INITIAL_PROPS_CONFLICT)
    }

    if (hasGetInitialProps && hasServerProps) {
      throw new Error(SERVER_PROPS_GET_INIT_PROPS_CONFLICT)
    }

    if (hasStaticProps && hasServerProps) {
      throw new Error(SERVER_PROPS_SSG_CONFLICT)
    }

    const pageIsDynamic = isDynamicRoute(page)
    // A page cannot have static parameters if it is not a dynamic page.
    if (hasStaticProps && hasStaticPaths && !pageIsDynamic) {
      throw new Error(
        `getStaticPaths can only be used with dynamic pages, not '${page}'.` +
          `\nLearn more: https://nextjs.org/docs/routing/dynamic-routes`
      )
    }

    if (hasStaticProps && pageIsDynamic && !hasStaticPaths) {
      throw new Error(
        `getStaticPaths is required for dynamic SSG pages and is missing for '${page}'.` +
          `\nRead more: https://err.sh/next.js/invalid-getstaticpaths-value`
      )
    }

    let prerenderRoutes: Array<string> | undefined
    let prerenderFallback: boolean | undefined
    if (hasStaticProps && hasStaticPaths) {
      ;({
        paths: prerenderRoutes,
        fallback: prerenderFallback,
      } = await buildStaticPaths(page, mod.getStaticPaths))
    }

    const config = mod.config || {}
    return {
      isStatic: !hasStaticProps && !hasGetInitialProps && !hasServerProps,
      isHybridAmp: config.amp === 'hybrid',
      isAmpOnly: config.amp === true,
      prerenderRoutes,
      prerenderFallback,
      hasStaticProps,
      hasServerProps,
    }
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') return {}
    throw err
  }
}

export function hasCustomGetInitialProps(
  bundle: string,
  runtimeEnvConfig: any,
  checkingApp: boolean
): boolean {
  require('../next-server/lib/runtime-config').setConfig(runtimeEnvConfig)
  let mod = require(bundle)

  if (checkingApp) {
    mod = mod._app || mod.default || mod
  } else {
    mod = mod.default || mod
  }
  return mod.getInitialProps !== mod.origGetInitialProps
}

export function getNamedExports(
  bundle: string,
  runtimeEnvConfig: any
): Array<string> {
  require('../next-server/lib/runtime-config').setConfig(runtimeEnvConfig)
  return Object.keys(require(bundle))
}
