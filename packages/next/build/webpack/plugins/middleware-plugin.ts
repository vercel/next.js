import { webpack, sources, webpack5 } from 'next/dist/compiled/webpack/webpack'
import { getMiddlewareRegex } from '../../../shared/lib/router/utils'
import { getSortedRoutes } from '../../../shared/lib/router/utils'
import {
  MIDDLEWARE_MANIFEST,
  MIDDLEWARE_FLIGHT_MANIFEST,
  MIDDLEWARE_BUILD_MANIFEST,
  MIDDLEWARE_REACT_LOADABLE_MANIFEST,
} from '../../../shared/lib/constants'
import { MIDDLEWARE_ROUTE } from '../../../lib/constants'
import { nonNullable } from '../../../lib/non-nullable'

const PLUGIN_NAME = 'MiddlewarePlugin'
const MIDDLEWARE_FULL_ROUTE_REGEX = /^pages[/\\]?(.*)\/_middleware$/

export const ssrEntries = new Map<string, { requireFlightManifest: boolean }>()

export interface MiddlewareManifest {
  version: 1
  sortedMiddleware: string[]
  clientInfo: [string, boolean][]
  middleware: {
    [page: string]: {
      env: string[]
      files: string[]
      name: string
      page: string
      regexp: string
    }
  }
}

const middlewareManifest: MiddlewareManifest = {
  sortedMiddleware: [],
  clientInfo: [],
  middleware: {},
  version: 1,
}
export default class MiddlewarePlugin {
  dev: boolean
  webServerRuntime: boolean

  constructor({
    dev,
    webServerRuntime,
  }: {
    dev: boolean
    webServerRuntime: boolean
  }) {
    this.dev = dev
    this.webServerRuntime = webServerRuntime
  }

  createAssets(
    compilation: webpack5.Compilation,
    assets: any,
    envPerRoute: Map<string, string[]>
  ) {
    const entrypoints = compilation.entrypoints

    for (const entrypoint of entrypoints.values()) {
      if (!entrypoint.name) continue
      const result = MIDDLEWARE_FULL_ROUTE_REGEX.exec(entrypoint.name)

      const ssrEntryInfo = ssrEntries.get(entrypoint.name)
      if (ssrEntryInfo && !this.webServerRuntime) continue
      if (!ssrEntryInfo && this.webServerRuntime) continue

      const location = result
        ? `/${result[1]}`
        : ssrEntryInfo
        ? entrypoint.name.slice('pages'.length).replace(/\/index$/, '') || '/'
        : null

      if (!location) {
        continue
      }

      const entryFiles = entrypoint
        .getFiles()
        .filter((file: string) => !file.endsWith('.hot-update.js'))

      const files = ssrEntryInfo
        ? [
            ssrEntryInfo.requireFlightManifest
              ? `server/${MIDDLEWARE_FLIGHT_MANIFEST}.js`
              : null,
            `server/${MIDDLEWARE_BUILD_MANIFEST}.js`,
            `server/${MIDDLEWARE_REACT_LOADABLE_MANIFEST}.js`,
            ...entryFiles.map((file) => 'server/' + file),
          ].filter(nonNullable)
        : entryFiles.map((file: string) =>
            // we need to use the unminified version of the webpack runtime,
            // remove if we do start minifying middleware chunks
            file.startsWith('static/chunks/webpack-')
              ? file.replace('webpack-', 'webpack-middleware-')
              : file
          )

      middlewareManifest.middleware[location] = {
        env: envPerRoute.get(entrypoint.name) || [],
        files,
        name: entrypoint.name,
        page: location,
        regexp: getMiddlewareRegex(location, !ssrEntryInfo).namedRegex!,
      }
    }

    middlewareManifest.sortedMiddleware = getSortedRoutes(
      Object.keys(middlewareManifest.middleware)
    )
    middlewareManifest.clientInfo = middlewareManifest.sortedMiddleware.map(
      (key) => {
        const middleware = middlewareManifest.middleware[key]
        const ssrEntryInfo = ssrEntries.get(middleware.name)
        return [key, !!ssrEntryInfo]
      }
    )

    assets[
      this.webServerRuntime
        ? MIDDLEWARE_MANIFEST
        : `server/${MIDDLEWARE_MANIFEST}`
    ] = new sources.RawSource(JSON.stringify(middlewareManifest, null, 2))
  }

  apply(compiler: webpack5.Compiler) {
    const { dev } = this
    const wp = compiler.webpack
    compiler.hooks.compilation.tap(
      PLUGIN_NAME,
      (compilation, { normalModuleFactory }) => {
        const envPerRoute = new Map<string, string[]>()

        compilation.hooks.afterOptimizeModules.tap(PLUGIN_NAME, () => {
          const { moduleGraph } = compilation as any
          envPerRoute.clear()

          for (const [name, info] of compilation.entries) {
            if (name.match(MIDDLEWARE_ROUTE)) {
              const middlewareEntries = new Set<webpack5.Module>()
              const env = new Set<string>()

              const addEntriesFromDependency = (dep: any) => {
                const module = moduleGraph.getModule(dep)
                if (module) {
                  middlewareEntries.add(module)
                }
              }

              const runtime = wp.util.runtime.getEntryRuntime(compilation, name)

              info.dependencies.forEach(addEntriesFromDependency)
              info.includeDependencies.forEach(addEntriesFromDependency)

              const queue = new Set(middlewareEntries)
              for (const module of queue) {
                const { buildInfo } = module
                if (
                  !dev &&
                  buildInfo &&
                  isUsedByExports({
                    module,
                    moduleGraph,
                    runtime,
                    usedByExports: buildInfo.usingIndirectEval,
                  })
                ) {
                  if (
                    /node_modules[\\/]regenerator-runtime[\\/]runtime\.js/.test(
                      module.identifier()
                    )
                  )
                    continue
                  const error = new wp.WebpackError(
                    `Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Middleware ${name}${
                      typeof buildInfo.usingIndirectEval !== 'boolean'
                        ? `\nUsed by ${Array.from(
                            buildInfo.usingIndirectEval
                          ).join(', ')}`
                        : ''
                    }`
                  )
                  error.module = module
                  compilation.errors.push(error)
                }

                if (buildInfo?.nextUsedEnvVars !== undefined) {
                  for (const envName of buildInfo.nextUsedEnvVars) {
                    env.add(envName)
                  }
                }

                const connections = moduleGraph.getOutgoingConnections(module)
                for (const connection of connections) {
                  if (connection.module) {
                    queue.add(connection.module)
                  }
                }
              }

              envPerRoute.set(name, Array.from(env))
            }
          }
        })

        const handler = (parser: webpack5.javascript.JavascriptParser) => {
          const isMiddlewareModule = () =>
            parser.state.module && parser.state.module.layer === 'middleware'

          const wrapExpression = (expr: any) => {
            if (!isMiddlewareModule()) return

            if (dev) {
              const dep1 = new wp.dependencies.ConstDependency(
                '__next_eval__(function() { return ',
                expr.range[0]
              )
              dep1.loc = expr.loc
              parser.state.module.addPresentationalDependency(dep1)
              const dep2 = new wp.dependencies.ConstDependency(
                '})',
                expr.range[1]
              )
              dep2.loc = expr.loc
              parser.state.module.addPresentationalDependency(dep2)
            }
            expressionHandler()
            return true
          }

          const flagModule = (
            usedByExports: boolean | Set<string> | undefined
          ) => {
            if (usedByExports === undefined) usedByExports = true
            const old = parser.state.module.buildInfo.usingIndirectEval
            if (old === true || usedByExports === false) return
            if (!old || usedByExports === true) {
              parser.state.module.buildInfo.usingIndirectEval = usedByExports
              return
            }
            const set = new Set(old)
            for (const item of usedByExports) {
              set.add(item)
            }
            parser.state.module.buildInfo.usingIndirectEval = set
          }

          const expressionHandler = () => {
            if (!isMiddlewareModule()) return

            wp.optimize.InnerGraph.onUsage(parser.state, flagModule)
          }

          const ignore = () => {
            if (!isMiddlewareModule()) return

            return true
          }

          // wrapping
          parser.hooks.call.for('eval').tap(PLUGIN_NAME, wrapExpression)
          parser.hooks.call.for('global.eval').tap(PLUGIN_NAME, wrapExpression)
          parser.hooks.call.for('Function').tap(PLUGIN_NAME, wrapExpression)
          parser.hooks.call
            .for('global.Function')
            .tap(PLUGIN_NAME, wrapExpression)
          parser.hooks.new.for('Function').tap(PLUGIN_NAME, wrapExpression)
          parser.hooks.new
            .for('global.Function')
            .tap(PLUGIN_NAME, wrapExpression)

          // fallbacks
          parser.hooks.expression
            .for('eval')
            .tap(PLUGIN_NAME, expressionHandler)
          parser.hooks.expression
            .for('Function')
            .tap(PLUGIN_NAME, expressionHandler)
          parser.hooks.expression
            .for('Function.prototype')
            .tap(PLUGIN_NAME, ignore)
          parser.hooks.expression
            .for('global.eval')
            .tap(PLUGIN_NAME, expressionHandler)
          parser.hooks.expression
            .for('global.Function')
            .tap(PLUGIN_NAME, expressionHandler)
          parser.hooks.expression
            .for('global.Function.prototype')
            .tap(PLUGIN_NAME, ignore)

          const memberChainHandler = (_expr: any, members: string[]) => {
            if (!isMiddlewareModule()) return

            if (members.length >= 2 && members[0] === 'env') {
              const envName = members[1]
              const { buildInfo } = parser.state.module
              if (buildInfo.nextUsedEnvVars === undefined) {
                buildInfo.nextUsedEnvVars = new Set()
              }

              buildInfo.nextUsedEnvVars.add(envName)
              return true
            }
          }

          parser.hooks.callMemberChain
            .for('process')
            .tap(PLUGIN_NAME, memberChainHandler)

          parser.hooks.expressionMemberChain
            .for('process')
            .tap(PLUGIN_NAME, memberChainHandler)
        }

        normalModuleFactory.hooks.parser
          .for('javascript/auto')
          .tap(PLUGIN_NAME, handler)

        normalModuleFactory.hooks.parser
          .for('javascript/dynamic')
          .tap(PLUGIN_NAME, handler)

        normalModuleFactory.hooks.parser
          .for('javascript/esm')
          .tap(PLUGIN_NAME, handler)

        // @ts-ignore TODO: Remove ignore when webpack 5 is stable
        compilation.hooks.processAssets.tap(
          {
            name: 'NextJsMiddlewareManifest',
            // @ts-ignore TODO: Remove ignore when webpack 5 is stable
            stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
          },
          (assets: any) => {
            this.createAssets(compilation, assets, envPerRoute)
          }
        )
      }
    )
  }
}

function isUsedByExports(args: {
  module: webpack5.Module
  moduleGraph: webpack5.ModuleGraph
  runtime: any
  usedByExports: boolean | Set<string> | undefined
}): boolean {
  const { moduleGraph, runtime, module, usedByExports } = args
  if (usedByExports === undefined) return false
  if (typeof usedByExports === 'boolean') return usedByExports
  const exportsInfo = moduleGraph.getExportsInfo(module)
  const wp = webpack as unknown as typeof webpack5
  for (const exportName of usedByExports) {
    if (exportsInfo.getUsed(exportName, runtime) !== wp.UsageState.Unused)
      return true
  }
  return false
}
