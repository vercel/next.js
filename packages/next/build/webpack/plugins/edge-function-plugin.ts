import { webpack, isWebpack5 } from 'next/dist/compiled/webpack/webpack'

const PLUGIN_NAME = 'EdgeFunctionPlugin'

export default class EdgeFunctionPlugin {
  apply(compiler: webpack.Compiler) {
    compiler.hooks.compilation.tap(
      PLUGIN_NAME,
      (compilation, { normalModuleFactory }) => {
        if (isWebpack5) {
          compilation.hooks.finishModules.tap(PLUGIN_NAME, () => {
            const { moduleGraph } = compilation as any
            const edgeEntries = new Set<webpack.Module>()

            const addEdgeEntriesFromDependency = (dep: any) => {
              const module = moduleGraph.getModule(dep)
              if (module) {
                edgeEntries.add(module)
              }
            }

            for (const [name, info] of compilation.entries) {
              if (name.endsWith('/_middleware')) {
                info.dependencies.forEach(addEdgeEntriesFromDependency)
                info.includeDependencies.forEach(addEdgeEntriesFromDependency)
              }
            }

            const queue = new Set(edgeEntries)
            for (const module of queue) {
              if (
                (module as any).buildInfo &&
                (module as any).buildInfo.usingIndirectEval &&
                !(module as any).resource.includes('react.development') &&
                !(module as any).resource.includes(
                  'react-dom-server.browser.development'
                )
              ) {
                compilation.errors.push(
                  new Error(
                    `Running \`eval\` is not allowed at ${
                      (module as any).resource
                    }`
                  )
                )
              }

              for (const connection of moduleGraph.getOutgoingConnections(
                module
              )) {
                if (connection.module) {
                  queue.add(connection.module)
                }
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
        }
      }
    )
  }
}
