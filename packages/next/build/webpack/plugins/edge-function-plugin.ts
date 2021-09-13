import {
  webpack,
  isWebpack5,
  sources,
} from 'next/dist/compiled/webpack/webpack'
import { EDGE_MANIFEST } from '../../../shared/lib/constants'
import { getMiddlewareRegex } from '../../../shared/lib/router/utils'
import { getSortedRoutes } from '../../../shared/lib/router/utils'

const PLUGIN_NAME = 'EdgeFunctionPlugin'
const MIDDLEWARE_FULL_ROUTE_REGEX = /^pages[/\\]?(.*)\/_middleware$/

export interface MiddlewareManifest {
  version: 1
  sortedMiddleware: string[]
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

export default class EdgeFunctionPlugin {
  dev: boolean

  constructor({ dev }: { dev: boolean }) {
    this.dev = dev
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
      const location = result ? `/${result[1]}` : null
      if (!location) {
        continue
      }

      const files = entrypoint
        .getFiles()
        .filter((file: string) => !file.endsWith('.hot-update.js'))

      middlewareManifest.middleware[location] = {
        env: envPerRoute.get(entrypoint.name)!,
        files,
        name: entrypoint.name,
        page: location,
        regexp: getMiddlewareRegex(location).namedRegex!,
      }
    }

    middlewareManifest.sortedMiddleware = getSortedRoutes(
      Object.keys(middlewareManifest.middleware)
    )

    assets[`server/${EDGE_MANIFEST}`] = new sources.RawSource(
      JSON.stringify(middlewareManifest, null, 2)
    )
  }

  apply(compiler: webpack.Compiler) {
    compiler.hooks.compilation.tap(
      PLUGIN_NAME,
      (compilation, { normalModuleFactory }) => {
        if (isWebpack5) {
          const envPerRoute = new Map<string, string[]>()

          compilation.hooks.finishModules.tap(PLUGIN_NAME, () => {
            const { moduleGraph } = compilation as any
            envPerRoute.clear()
            for (const [name, info] of compilation.entries) {
              if (name.endsWith('/_middleware')) {
                const edgeEntries = new Set<webpack.Module>()
                const env = new Set<string>()

                const addEdgeEntriesFromDependency = (dep: any) => {
                  const module = moduleGraph.getModule(dep)
                  if (module) {
                    edgeEntries.add(module)
                  }
                }

                info.dependencies.forEach(addEdgeEntriesFromDependency)
                info.includeDependencies.forEach(addEdgeEntriesFromDependency)

                const queue = new Set(edgeEntries)
                for (const module of queue) {
                  const buildInfo = (module as any).buildInfo
                  if (buildInfo) {
                    if (
                      buildInfo.usingIndirectEval &&
                      !(module as any).resource.includes('react.development') &&
                      !(module as any).resource.includes(
                        'react-dom-server.browser.development'
                      )
                    ) {
                      // @ts-ignore TODO: Remove ignore when webpack 5 is stable
                      const error = new webpack.WebpackError(
                        `Running \`eval\` is not allowed in edge middleware ${name}`
                      )
                      error.module = module
                      compilation.errors.push(error)
                    }

                    if (buildInfo.nextUsedEnvVars !== undefined) {
                      for (const envName of buildInfo.nextUsedEnvVars) {
                        env.add(envName)
                      }
                    }
                  }

                  for (const connection of moduleGraph.getOutgoingConnections(
                    module
                  )) {
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
                parser.state.module.layer !== 'edge'
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
      }
    )
  }
}
