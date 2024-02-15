import type { NextConfigComplete } from '../config-shared'
import loadJsConfig from '../../build/load-jsconfig'
import type {
  ServerFields,
  SetupOpts,
} from '../lib/router-utils/setup-dev-bundler'
import type {
  Endpoint,
  Entrypoints,
  Issue,
  Route,
  StyledString,
  TurbopackResult,
  WrittenEndpoint,
} from '../../build/swc'
import {
  decodeMagicIdentifier,
  MAGIC_IDENTIFIER_REGEX,
} from '../../shared/lib/magic-identifier'
import { bold, green, magenta, red } from '../../lib/picocolors'
import {
  type HMR_ACTION_TYPES,
  HMR_ACTIONS_SENT_TO_BROWSER,
} from './hot-reloader-types'
import * as Log from '../../build/output/log'
import type { PropagateToWorkersField } from '../lib/router-utils/types'
import {
  type ActionManifests,
  type AppBuildManifests,
  type AppPathsManifests,
  type BuildManifests,
  type FontManifests,
  type LoadableManifests,
  loadActionManifest,
  loadAppBuildManifest,
  loadAppPathManifest,
  loadBuildManifest,
  loadFontManifest,
  loadLoadableManifest,
  loadMiddlewareManifest,
  loadPagesManifest,
  type MiddlewareManifests,
  type PagesManifests,
  writeManifests,
} from './turbopack/manifest-loader'

export async function getTurbopackJsConfig(
  dir: string,
  nextConfig: NextConfigComplete
) {
  const { jsConfig } = await loadJsConfig(dir, nextConfig)
  return jsConfig ?? { compilerOptions: {} }
}

export type CurrentEntrypoints = Map<string, Route>
export type ChangeSubscriptions = Map<
  string,
  Promise<AsyncIterableIterator<TurbopackResult>>
>

class ModuleBuildError extends Error {}

function issueKey(issue: Issue): string {
  return [
    issue.severity,
    issue.filePath,
    JSON.stringify(issue.title),
    JSON.stringify(issue.description),
  ].join('-')
}

export function formatIssue(issue: Issue) {
  const { filePath, title, description, source } = issue
  let { documentationLink } = issue
  let formattedTitle = renderStyledStringToErrorAnsi(title).replace(
    /\n/g,
    '\n    '
  )

  // TODO: Use error codes to identify these
  // TODO: Generalize adapting Turbopack errors to Next.js errors
  if (formattedTitle.includes('Module not found')) {
    // For compatiblity with webpack
    // TODO: include columns in webpack errors.
    documentationLink = 'https://nextjs.org/docs/messages/module-not-found'
  }

  let formattedFilePath = filePath
    .replace('[project]/', './')
    .replaceAll('/./', '/')
    .replace('\\\\?\\', '')

  let message

  if (source && source.range) {
    const { start } = source.range
    message = `${formattedFilePath}:${start.line + 1}:${
      start.column + 1
    }\n${formattedTitle}`
  } else if (formattedFilePath) {
    message = `${formattedFilePath}\n${formattedTitle}`
  } else {
    message = formattedTitle
  }
  message += '\n'

  if (source?.range && source.source.content) {
    const { start, end } = source.range
    const { codeFrameColumns } = require('next/dist/compiled/babel/code-frame')

    message +=
      codeFrameColumns(
        source.source.content,
        {
          start: {
            line: start.line + 1,
            column: start.column + 1,
          },
          end: {
            line: end.line + 1,
            column: end.column + 1,
          },
        },
        { forceColor: true }
      ).trim() + '\n\n'
  }

  if (description) {
    message += renderStyledStringToErrorAnsi(description) + '\n\n'
  }

  // TODO: make it possible to enable this for debugging, but not in tests.
  // if (detail) {
  //   message += renderStyledStringToErrorAnsi(detail) + '\n\n'
  // }

  // TODO: Include a trace from the issue.

  if (documentationLink) {
    message += documentationLink + '\n\n'
  }

  return message
}

export type CurrentIssues = Map<string, Map<string, Issue>>

export function processIssues(
  currentIssues: CurrentIssues,
  name: string,
  result: TurbopackResult,
  throwIssue = false
) {
  const newIssues = new Map<string, Issue>()
  currentIssues.set(name, newIssues)

  const relevantIssues = new Set()

  for (const issue of result.issues) {
    if (issue.severity !== 'error' && issue.severity !== 'fatal') continue
    const key = issueKey(issue)
    const formatted = formatIssue(issue)
    newIssues.set(key, issue)

    // We show errors in node_modules to the console, but don't throw for them
    if (/(^|\/)node_modules(\/|$)/.test(issue.filePath)) continue
    relevantIssues.add(formatted)
  }

  if (relevantIssues.size && throwIssue) {
    throw new ModuleBuildError([...relevantIssues].join('\n\n'))
  }
}

export function renderStyledStringToErrorAnsi(string: StyledString): string {
  function decodeMagicIdentifiers(str: string): string {
    return str.replaceAll(MAGIC_IDENTIFIER_REGEX, (ident) => {
      try {
        return magenta(`{${decodeMagicIdentifier(ident)}}`)
      } catch (e) {
        return magenta(`{${ident} (decoding failed: ${e})}`)
      }
    })
  }

  switch (string.type) {
    case 'text':
      return decodeMagicIdentifiers(string.value)
    case 'strong':
      return bold(red(decodeMagicIdentifiers(string.value)))
    case 'code':
      return green(decodeMagicIdentifiers(string.value))
    case 'line':
      return string.value.map(renderStyledStringToErrorAnsi).join('')
    case 'stack':
      return string.value.map(renderStyledStringToErrorAnsi).join('\n')
    default:
      throw new Error('Unknown StyledString type', string)
  }
}

const MILLISECONDS_IN_NANOSECOND = 1_000_000

export function msToNs(ms: number): bigint {
  return BigInt(Math.floor(ms)) * BigInt(MILLISECONDS_IN_NANOSECOND)
}

export interface GlobalEntrypoints {
  app: Endpoint | undefined
  document: Endpoint | undefined
  error: Endpoint | undefined
}

export type HandleRequireCacheClearing = (
  id: string,
  result: TurbopackResult<WrittenEndpoint>
) => void

export type ChangeSubscription = (
  page: string,
  type: 'client' | 'server',
  includeIssues: boolean,
  endpoint: Endpoint | undefined,
  makePayload: (
    page: string,
    change: TurbopackResult
  ) => Promise<HMR_ACTION_TYPES> | HMR_ACTION_TYPES | void
) => Promise<void>

export type ClearChangeSubscription = (
  page: string,
  type: 'server' | 'client'
) => Promise<void>

export type SendHmr = (id: string, payload: HMR_ACTION_TYPES) => void

export type StartBuilding = (
  id: string,
  requestUrl: string | undefined,
  forceRebuild: boolean
) => () => void

export type ReadyIds = Set<string>

export async function handleRouteType({
  rewrites,
  distDir,
  buildId,
  globalEntrypoints,
  currentIssues,
  buildManifests,
  appBuildManifests,
  pagesManifests,
  appPathsManifests,
  middlewareManifests,
  actionManifests,
  fontManifests,
  loadableManifests,
  currentEntrypoints,
  handleRequireCacheClearing,
  changeSubscription,
  readyIds,
  page,
  route,
}: {
  rewrites: SetupOpts['fsChecker']['rewrites']
  distDir: string
  buildId: string
  globalEntrypoints: GlobalEntrypoints
  currentIssues: CurrentIssues
  buildManifests: BuildManifests
  appBuildManifests: AppBuildManifests
  pagesManifests: PagesManifests
  appPathsManifests: AppPathsManifests
  middlewareManifests: MiddlewareManifests
  actionManifests: ActionManifests
  fontManifests: FontManifests
  loadableManifests: LoadableManifests
  currentEntrypoints: CurrentEntrypoints
  handleRequireCacheClearing: HandleRequireCacheClearing | undefined // Dev
  changeSubscription: ChangeSubscription | undefined // Dev
  readyIds: ReadyIds | undefined // Dev
  page: string
  route: Route
}) {
  switch (route.type) {
    case 'page': {
      try {
        if (globalEntrypoints.app) {
          const writtenEndpoint = await globalEntrypoints.app.writeToDisk()
          handleRequireCacheClearing?.('_app', writtenEndpoint)
          processIssues(currentIssues, '_app', writtenEndpoint)
        }
        await loadBuildManifest(distDir, buildManifests, '_app')
        await loadPagesManifest(distDir, pagesManifests, '_app')

        if (globalEntrypoints.document) {
          const writtenEndpoint = await globalEntrypoints.document.writeToDisk()
          handleRequireCacheClearing?.('_document', writtenEndpoint)
          processIssues(currentIssues, '_document', writtenEndpoint)
        }
        await loadPagesManifest(distDir, pagesManifests, '_document')

        const writtenEndpoint = await route.htmlEndpoint.writeToDisk()
        handleRequireCacheClearing?.(page, writtenEndpoint)

        const type = writtenEndpoint?.type

        await loadBuildManifest(distDir, buildManifests, page)
        await loadPagesManifest(distDir, pagesManifests, page)
        if (type === 'edge') {
          await loadMiddlewareManifest(
            distDir,
            middlewareManifests,
            page,
            'pages'
          )
        } else {
          middlewareManifests.delete(page)
        }
        await loadFontManifest(distDir, fontManifests, page, 'pages')
        await loadLoadableManifest(distDir, loadableManifests, page, 'pages')

        await writeManifests({
          rewrites,
          distDir,
          buildId,
          buildManifests,
          appBuildManifests,
          pagesManifests,
          appPathsManifests,
          middlewareManifests,
          actionManifests,
          fontManifests,
          loadableManifests,
          currentEntrypoints,
        })

        processIssues(currentIssues, page, writtenEndpoint)
      } finally {
        changeSubscription?.(
          page,
          'server',
          false,
          route.dataEndpoint,
          (pageName) => {
            // Report the next compilation again
            readyIds?.delete(page)
            return {
              event: HMR_ACTIONS_SENT_TO_BROWSER.SERVER_ONLY_CHANGES,
              pages: [pageName],
            }
          }
        )
        changeSubscription?.(page, 'client', false, route.htmlEndpoint, () => {
          return {
            event: HMR_ACTIONS_SENT_TO_BROWSER.CLIENT_CHANGES,
          }
        })
        if (globalEntrypoints.document) {
          changeSubscription?.(
            '_document',
            'server',
            false,
            globalEntrypoints.document,
            () => {
              return { action: HMR_ACTIONS_SENT_TO_BROWSER.RELOAD_PAGE }
            }
          )
        }
      }

      break
    }
    case 'page-api': {
      const writtenEndpoint = await route.endpoint.writeToDisk()
      handleRequireCacheClearing?.(page, writtenEndpoint)

      const type = writtenEndpoint?.type

      await loadPagesManifest(distDir, pagesManifests, page)
      if (type === 'edge') {
        await loadMiddlewareManifest(
          distDir,
          middlewareManifests,
          page,
          'pages'
        )
      } else {
        middlewareManifests.delete(page)
      }
      await loadLoadableManifest(distDir, loadableManifests, page, 'pages')

      await writeManifests({
        rewrites,
        distDir,
        buildId,
        buildManifests,
        appBuildManifests,
        pagesManifests,
        appPathsManifests,
        middlewareManifests,
        actionManifests,
        fontManifests,
        loadableManifests,
        currentEntrypoints,
      })

      processIssues(currentIssues, page, writtenEndpoint)

      break
    }
    case 'app-page': {
      const writtenEndpoint = await route.htmlEndpoint.writeToDisk()
      handleRequireCacheClearing?.(page, writtenEndpoint)

      changeSubscription?.(
        page,
        'server',
        true,
        route.rscEndpoint,
        (_page, change) => {
          if (change.issues.some((issue) => issue.severity === 'error')) {
            // Ignore any updates that has errors
            // There will be another update without errors eventually
            return
          }
          // Report the next compilation again
          readyIds?.delete(page)
          return {
            action: HMR_ACTIONS_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES,
          }
        }
      )

      const type = writtenEndpoint?.type

      if (type === 'edge') {
        await loadMiddlewareManifest(distDir, middlewareManifests, page, 'app')
      } else {
        middlewareManifests.delete(page)
      }

      await loadAppBuildManifest(distDir, appBuildManifests, page)
      await loadBuildManifest(distDir, buildManifests, page, 'app')
      await loadAppPathManifest(distDir, appPathsManifests, page, 'app')
      await loadActionManifest(distDir, actionManifests, page)
      await loadFontManifest(distDir, fontManifests, page, 'app')
      await writeManifests({
        rewrites,
        distDir,
        buildId,
        buildManifests,
        appBuildManifests,
        pagesManifests,
        appPathsManifests,
        middlewareManifests,
        actionManifests,
        fontManifests,
        loadableManifests,
        currentEntrypoints,
      })

      processIssues(currentIssues, page, writtenEndpoint, true)

      break
    }
    case 'app-route': {
      const writtenEndpoint = await route.endpoint.writeToDisk()
      handleRequireCacheClearing?.(page, writtenEndpoint)

      const type = writtenEndpoint?.type

      await loadAppPathManifest(distDir, appPathsManifests, page, 'app-route')
      if (type === 'edge') {
        await loadMiddlewareManifest(
          distDir,
          middlewareManifests,
          page,
          'app-route'
        )
      } else {
        middlewareManifests.delete(page)
      }

      await writeManifests({
        rewrites,
        distDir,
        buildId,
        buildManifests,
        appBuildManifests,
        pagesManifests,
        appPathsManifests,
        middlewareManifests,
        actionManifests,
        fontManifests,
        loadableManifests,
        currentEntrypoints,
      })
      processIssues(currentIssues, page, writtenEndpoint, true)

      break
    }
    default: {
      throw new Error(`unknown route type ${(route as any).type} for ${page}`)
    }
  }
}

export async function handleEntrypoints({
  rewrites,
  nextConfig,
  entrypoints,
  serverFields,
  propagateServerField,
  distDir,
  buildId,
  globalEntrypoints,
  currentEntrypoints,
  changeSubscriptions,
  changeSubscription,
  clearChangeSubscription,
  sendHmr,
  startBuilding,
  handleRequireCacheClearing,
  prevMiddleware,
  currentIssues,
  buildManifests,
  appBuildManifests,
  pagesManifests,
  appPathsManifests,
  middlewareManifests,
  actionManifests,
  fontManifests,
  loadableManifests,
}: {
  rewrites: SetupOpts['fsChecker']['rewrites']
  nextConfig: NextConfigComplete
  entrypoints: TurbopackResult<Entrypoints>
  serverFields: ServerFields | undefined
  propagateServerField:
    | ((field: PropagateToWorkersField, args: any) => Promise<void>)
    | undefined
  distDir: string
  buildId: string
  globalEntrypoints: GlobalEntrypoints
  currentEntrypoints: CurrentEntrypoints
  changeSubscriptions: ChangeSubscriptions | undefined
  changeSubscription: ChangeSubscription | undefined
  clearChangeSubscription: ClearChangeSubscription | undefined
  sendHmr: SendHmr | undefined
  startBuilding: StartBuilding | undefined
  handleRequireCacheClearing: HandleRequireCacheClearing | undefined
  prevMiddleware: boolean | undefined
  currentIssues: CurrentIssues
  buildManifests: BuildManifests
  appBuildManifests: AppBuildManifests
  pagesManifests: PagesManifests
  appPathsManifests: AppPathsManifests
  middlewareManifests: MiddlewareManifests
  actionManifests: ActionManifests
  fontManifests: FontManifests
  loadableManifests: LoadableManifests
}) {
  globalEntrypoints.app = entrypoints.pagesAppEndpoint
  globalEntrypoints.document = entrypoints.pagesDocumentEndpoint
  globalEntrypoints.error = entrypoints.pagesErrorEndpoint

  currentEntrypoints.clear()

  for (const [pathname, route] of entrypoints.routes) {
    switch (route.type) {
      case 'page':
      case 'page-api':
      case 'app-page':
      case 'app-route': {
        currentEntrypoints.set(pathname, route)
        break
      }
      default:
        Log.info(`skipping ${pathname} (${route.type})`)
        break
    }
  }

  if (changeSubscriptions) {
    for (const [pathname, subscriptionPromise] of changeSubscriptions) {
      if (pathname === '') {
        // middleware is handled below
        continue
      }

      if (!currentEntrypoints.has(pathname)) {
        const subscription = await subscriptionPromise
        subscription.return?.()
        changeSubscriptions.delete(pathname)
      }
    }
  }

  const { middleware, instrumentation } = entrypoints
  // We check for explicit true/false, since it's initialized to
  // undefined during the first loop (middlewareChanges event is
  // unnecessary during the first serve)
  if (prevMiddleware === true && !middleware) {
    // Went from middleware to no middleware
    await clearChangeSubscription?.('middleware', 'server')
    sendHmr?.('middleware', {
      event: HMR_ACTIONS_SENT_TO_BROWSER.MIDDLEWARE_CHANGES,
    })
  } else if (prevMiddleware === false && middleware) {
    // Went from no middleware to middleware
    sendHmr?.('middleware', {
      event: HMR_ACTIONS_SENT_TO_BROWSER.MIDDLEWARE_CHANGES,
    })
  }

  if (nextConfig.experimental.instrumentationHook && instrumentation) {
    const processInstrumentation = async (
      displayName: string,
      name: string,
      prop: 'nodeJs' | 'edge'
    ) => {
      const writtenEndpoint = await instrumentation[prop].writeToDisk()
      handleRequireCacheClearing?.(displayName, writtenEndpoint)
      processIssues(currentIssues, name, writtenEndpoint)
    }
    await processInstrumentation(
      'instrumentation (node.js)',
      'instrumentation.nodeJs',
      'nodeJs'
    )
    await processInstrumentation(
      'instrumentation (edge)',
      'instrumentation.edge',
      'edge'
    )
    await loadMiddlewareManifest(
      distDir,
      middlewareManifests,
      'instrumentation',
      'instrumentation'
    )
    await writeManifests({
      rewrites: rewrites,
      distDir,
      buildId,
      buildManifests,
      appBuildManifests,
      pagesManifests,
      appPathsManifests,
      middlewareManifests,
      actionManifests,
      fontManifests,
      loadableManifests,
      currentEntrypoints,
    })

    if (serverFields && propagateServerField) {
      serverFields.actualInstrumentationHookFile = '/instrumentation'
      await propagateServerField(
        'actualInstrumentationHookFile',
        serverFields.actualInstrumentationHookFile
      )
    }
  } else {
    if (serverFields && propagateServerField) {
      serverFields.actualInstrumentationHookFile = undefined
      await propagateServerField(
        'actualInstrumentationHookFile',
        serverFields.actualInstrumentationHookFile
      )
    }
  }
  if (middleware) {
    const processMiddleware = async () => {
      const writtenEndpoint = await middleware.endpoint.writeToDisk()
      handleRequireCacheClearing?.('middleware', writtenEndpoint)
      processIssues(currentIssues, 'middleware', writtenEndpoint)
      await loadMiddlewareManifest(
        distDir,
        middlewareManifests,
        'middleware',
        'middleware'
      )
      if (serverFields) {
        serverFields.middleware = {
          match: null as any,
          page: '/',
          matchers:
            middlewareManifests.get('middleware')?.middleware['/'].matchers,
        }
      }
    }
    await processMiddleware()

    changeSubscription?.(
      'middleware',
      'server',
      false,
      middleware.endpoint,
      async () => {
        const finishBuilding = startBuilding?.('middleware', undefined, true)
        await processMiddleware()
        if (serverFields && propagateServerField) {
          await propagateServerField(
            'actualMiddlewareFile',
            serverFields.actualMiddlewareFile
          )
          await propagateServerField('middleware', serverFields.middleware)
        }
        await writeManifests({
          rewrites: rewrites,
          distDir,
          buildId,
          buildManifests,
          appBuildManifests,
          pagesManifests,
          appPathsManifests,
          middlewareManifests,
          actionManifests,
          fontManifests,
          loadableManifests,
          currentEntrypoints,
        })

        finishBuilding?.()
        return { event: HMR_ACTIONS_SENT_TO_BROWSER.MIDDLEWARE_CHANGES }
      }
    )
    prevMiddleware = true
  } else {
    middlewareManifests.delete('middleware')
    if (serverFields) {
      serverFields.actualMiddlewareFile = undefined
      serverFields.middleware = undefined
      prevMiddleware = false
    }
  }
  if (serverFields && propagateServerField) {
    await propagateServerField(
      'actualMiddlewareFile',
      serverFields.actualMiddlewareFile
    )
    await propagateServerField('middleware', serverFields.middleware)
  }
}

export async function handlePagesErrorRoute({
  rewrites,
  globalEntrypoints,
  currentIssues,
  distDir,
  buildId,
  buildManifests,
  pagesManifests,
  fontManifests,
  appBuildManifests,
  appPathsManifests,
  middlewareManifests,
  actionManifests,
  loadableManifests,
  currentEntrypoints,
  handleRequireCacheClearing,
  changeSubscription,
}: {
  rewrites: SetupOpts['fsChecker']['rewrites']
  globalEntrypoints: GlobalEntrypoints
  currentIssues: CurrentIssues
  distDir: string
  buildId: string
  buildManifests: BuildManifests
  pagesManifests: PagesManifests
  fontManifests: FontManifests
  appBuildManifests: AppBuildManifests
  appPathsManifests: AppPathsManifests
  middlewareManifests: MiddlewareManifests
  actionManifests: ActionManifests
  loadableManifests: LoadableManifests
  currentEntrypoints: CurrentEntrypoints
  handleRequireCacheClearing: HandleRequireCacheClearing | undefined
  changeSubscription: ChangeSubscription | undefined
}) {
  if (globalEntrypoints.app) {
    const writtenEndpoint = await globalEntrypoints.app.writeToDisk()
    handleRequireCacheClearing?.('_app', writtenEndpoint)
    processIssues(currentIssues, '_app', writtenEndpoint)
  }
  await loadBuildManifest(distDir, buildManifests, '_app')
  await loadPagesManifest(distDir, pagesManifests, '_app')
  await loadFontManifest(distDir, fontManifests, '_app')

  if (globalEntrypoints.document) {
    const writtenEndpoint = await globalEntrypoints.document.writeToDisk()
    handleRequireCacheClearing?.('_document', writtenEndpoint)
    changeSubscription?.(
      '_document',
      'server',
      false,
      globalEntrypoints.document,
      () => {
        return { action: HMR_ACTIONS_SENT_TO_BROWSER.RELOAD_PAGE }
      }
    )
    processIssues(currentIssues, '_document', writtenEndpoint)
  }
  await loadPagesManifest(distDir, pagesManifests, '_document')

  if (globalEntrypoints.error) {
    const writtenEndpoint = await globalEntrypoints.error.writeToDisk()
    handleRequireCacheClearing?.('_error', writtenEndpoint)
    processIssues(currentIssues, '/_error', writtenEndpoint)
  }
  await loadBuildManifest(distDir, buildManifests, '_error')
  await loadPagesManifest(distDir, pagesManifests, '_error')
  await loadFontManifest(distDir, fontManifests, '_error')

  await writeManifests({
    rewrites,
    distDir,
    buildId,
    buildManifests,
    appBuildManifests,
    pagesManifests,
    appPathsManifests,
    middlewareManifests,
    actionManifests,
    fontManifests,
    loadableManifests,
    currentEntrypoints,
  })
}
