import { webpack, sources } from 'next/dist/compiled/webpack/webpack'
import { getMiddlewareRegex } from '../../../shared/lib/router/utils'
import { getSortedRoutes } from '../../../shared/lib/router/utils'
import {
  MIDDLEWARE_MANIFEST,
  MIDDLEWARE_FLIGHT_MANIFEST,
  MIDDLEWARE_SSR_RUNTIME_WEBPACK,
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
  sortedMiddleware: [string, boolean][]
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

export default class MiddlewarePlugin {
  dev: boolean
  hasServerComponents?: boolean

  constructor({
    dev,
    hasServerComponents,
  }: {
    dev: boolean
    hasServerComponents?: boolean
  }) {
    this.dev = dev
    this.hasServerComponents = hasServerComponents
  }

  createAssets(
    compilation: any,
    assets: any,
    envPerRoute: Map<string, string[]>
  ) {
    const entrypoints = compilation.entrypoints
    const middlewareManifest: MiddlewareManifest = {
      sortedMiddleware: [],
      middleware: {},
      version: 1,
    }

    for (const entrypoint of entrypoints.values()) {
      const result = MIDDLEWARE_FULL_ROUTE_REGEX.exec(entrypoint.name)
      const ssrEntryInfo = ssrEntries.get(entrypoint.name)

      const location = result
        ? `/${result[1]}`
        : ssrEntryInfo
        ? entrypoint.name.slice('pages'.length).replace(/\/index$/, '') || '/'
        : null

      if (!location) {
        continue
      }
      const files = ssrEntryInfo
        ? [
            `server/${MIDDLEWARE_SSR_RUNTIME_WEBPACK}.js`,
            ssrEntryInfo.requireFlightManifest
              ? `server/${MIDDLEWARE_FLIGHT_MANIFEST}.js`
              : null,
            `server/${MIDDLEWARE_BUILD_MANIFEST}.js`,
            `server/${MIDDLEWARE_REACT_LOADABLE_MANIFEST}.js`,
            `server/${entrypoint.name}.js`,
          ].filter(nonNullable)
        : entrypoint
            .getFiles()
            .filter((file: string) => !file.endsWith('.hot-update.js'))
            .map((file: string) =>
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
    ).map((key) => {
      const ssrEntryInfo = ssrEntries.get(
        middlewareManifest.middleware[key].name
      )
      return [key, !!ssrEntryInfo]
    })

    assets[`server/${MIDDLEWARE_MANIFEST}`] = new sources.RawSource(
      JSON.stringify(middlewareManifest, null, 2)
    )
  }

  apply(compiler: webpack.Compiler) {
    compiler.hooks.compilation.tap(
      PLUGIN_NAME,
      (compilation, { normalModuleFactory }) => {
        const envPerRoute = new Map<string, string[]>()

        compilation.hooks.finishModules.tap(PLUGIN_NAME, () => {
          const { moduleGraph } = compilation as any
          envPerRoute.clear()

          for (const [name, info] of compilation.entries) {
            if (name.match(MIDDLEWARE_ROUTE)) {
              const middlewareEntries = new Set<webpack.Module>()
              const env = new Set<string>()

              const addEntriesFromDependency = (dep: any) => {
                const module = moduleGraph.getModule(dep)
                if (module) {
                  middlewareEntries.add(module)
                }
              }

              info.dependencies.forEach(addEntriesFromDependency)
              info.includeDependencies.forEach(addEntriesFromDependency)

              const queue = new Set(middlewareEntries)
              for (const module of queue) {
                const { buildInfo } = module as any
                if (buildInfo?.usingIndirectEval) {
                  // @ts-ignore TODO: Remove ignore when webpack 5 is stable
                  const error = new webpack.WebpackError(
                    `\`eval\` not allowed in Middleware ${name}`
                  )
                  error.module = module
                  compilation.warnings.push(error)
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

        const handler = (parser: any) => {
          const flagModule = () => {
            parser.state.module.buildInfo.usingIndirectEval = true
          }

          parser.hooks.expression.for('eval').tap(PLUGIN_NAME, flagModule)
          parser.hooks.expression.for('Function').tap(PLUGIN_NAME, flagModule)
          parser.hooks.expression
            .for('global.eval')
            .tap(PLUGIN_NAME, flagModule)
          parser.hooks.expression
            .for('global.Function')
            .tap(PLUGIN_NAME, flagModule)

          const memberChainHandler = (_expr: any, members: string[]) => {
            if (
              !parser.state.module ||
              parser.state.module.layer !== 'middleware'
            ) {
              return
            }

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
