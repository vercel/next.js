import type { EdgeMiddlewareMeta } from '../loaders/get-module-build-info'
import type { EdgeSSRMeta, WasmBinding } from '../loaders/get-module-build-info'
import { getMiddlewareRegex } from '../../../shared/lib/router/utils'
import { getModuleBuildInfo } from '../loaders/get-module-build-info'
import { getSortedRoutes } from '../../../shared/lib/router/utils'
import { webpack, sources, webpack5 } from 'next/dist/compiled/webpack/webpack'
import {
  EDGE_RUNTIME_WEBPACK,
  MIDDLEWARE_BUILD_MANIFEST,
  MIDDLEWARE_FLIGHT_MANIFEST,
  MIDDLEWARE_MANIFEST,
  MIDDLEWARE_REACT_LOADABLE_MANIFEST,
} from '../../../shared/lib/constants'

export interface MiddlewareManifest {
  version: 1
  sortedMiddleware: string[]
  clientInfo: [location: string, isSSR: boolean][]
  middleware: {
    [page: string]: {
      env: string[]
      files: string[]
      name: string
      page: string
      regexp: string
      wasm?: WasmBinding[]
    }
  }
}

interface EntryMetadata {
  edgeMiddleware?: EdgeMiddlewareMeta
  edgeSSR?: EdgeSSRMeta
  env: Set<string>
  wasmBindings: Set<WasmBinding>
}

const NAME = 'MiddlewarePlugin'
const middlewareManifest: MiddlewareManifest = {
  sortedMiddleware: [],
  clientInfo: [],
  middleware: {},
  version: 1,
}

export default class MiddlewarePlugin {
  dev: boolean

  constructor({ dev }: { dev: boolean }) {
    this.dev = dev
  }

  apply(compiler: webpack5.Compiler) {
    compiler.hooks.compilation.tap(NAME, (compilation, params) => {
      const { hooks } = params.normalModuleFactory

      /**
       * This is the static code analysis phase.
       */
      const codeAnalyzer = getCodeAnalizer({ dev: this.dev, compiler })
      hooks.parser.for('javascript/auto').tap(NAME, codeAnalyzer)
      hooks.parser.for('javascript/dynamic').tap(NAME, codeAnalyzer)
      hooks.parser.for('javascript/esm').tap(NAME, codeAnalyzer)

      /**
       * Extract all metadata for the entry points in a Map object.
       */
      const metadataByEntry = new Map<string, EntryMetadata>()
      compilation.hooks.afterOptimizeModules.tap(
        NAME,
        getExtractMetadata({
          compilation,
          compiler,
          dev: this.dev,
          metadataByEntry,
        })
      )

      /**
       * Emit the middleware manifest.
       */
      compilation.hooks.processAssets.tap(
        {
          name: 'NextJsMiddlewareManifest',
          stage: (webpack as any).Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
        },
        getCreateAssets({ compilation, metadataByEntry })
      )
    })
  }
}

function getCodeAnalizer(params: {
  dev: boolean
  compiler: webpack5.Compiler
}) {
  return (parser: webpack5.javascript.JavascriptParser) => {
    const {
      dev,
      compiler: { webpack: wp },
    } = params
    const { hooks } = parser

    /**
     * This expression handler allows to wrap a dynamic code expression with a
     * function call where we can warn about dynamic code not being allowed
     * but actually execute the expression.
     */
    const handleWrapExpression = (expr: any) => {
      if (parser.state.module?.layer !== 'middleware') {
        return
      }

      if (dev) {
        const { ConstDependency } = wp.dependencies
        const dep1 = new ConstDependency(
          '__next_eval__(function() { return ',
          expr.range[0]
        )
        dep1.loc = expr.loc
        parser.state.module.addPresentationalDependency(dep1)
        const dep2 = new ConstDependency('})', expr.range[1])
        dep2.loc = expr.loc
        parser.state.module.addPresentationalDependency(dep2)
      }

      handleExpression()
      return true
    }

    /**
     * For an expression this will check the graph to ensure it is being used
     * by exports. Then it will store in the module buildInfo a boolean to
     * express that it contains dynamic code and, if it is available, the
     * module path that is using it.
     */
    const handleExpression = () => {
      if (parser.state.module?.layer !== 'middleware') {
        return
      }

      wp.optimize.InnerGraph.onUsage(parser.state, (used = true) => {
        const buildInfo = getModuleBuildInfo(parser.state.module)
        if (buildInfo.usingIndirectEval === true || used === false) {
          return
        }

        if (!buildInfo.usingIndirectEval || used === true) {
          buildInfo.usingIndirectEval = used
          return
        }

        buildInfo.usingIndirectEval = new Set([
          ...Array.from(buildInfo.usingIndirectEval),
          ...Array.from(used),
        ])
      })
    }

    /**
     * A handler for calls to `process.env` where we identify the name of the
     * ENV variable being assigned and store it in the module info.
     */
    const handleCallMemberChain = (_: unknown, members: string[]) => {
      if (members.length >= 2 && members[0] === 'env') {
        const buildInfo = getModuleBuildInfo(parser.state.module)
        if (buildInfo.nextUsedEnvVars === undefined) {
          buildInfo.nextUsedEnvVars = new Set()
        }

        buildInfo.nextUsedEnvVars.add(members[1])
        if (parser.state.module?.layer !== 'middleware') {
          return true
        }
      }
    }

    /**
     * A noop handler to skip analyzing some cases.
     */
    const noop = () =>
      parser.state.module?.layer === 'middleware' ? true : undefined

    hooks.call.for('eval').tap(NAME, handleWrapExpression)
    hooks.call.for('global.eval').tap(NAME, handleWrapExpression)
    hooks.call.for('Function').tap(NAME, handleWrapExpression)
    hooks.call.for('global.Function').tap(NAME, handleWrapExpression)
    hooks.new.for('Function').tap(NAME, handleWrapExpression)
    hooks.new.for('global.Function').tap(NAME, handleWrapExpression)
    hooks.expression.for('eval').tap(NAME, handleExpression)
    hooks.expression.for('Function').tap(NAME, handleExpression)
    hooks.expression.for('global.eval').tap(NAME, handleExpression)
    hooks.expression.for('global.Function').tap(NAME, handleExpression)
    hooks.expression.for('Function.prototype').tap(NAME, noop)
    hooks.expression.for('global.Function.prototype').tap(NAME, noop)
    hooks.callMemberChain.for('process').tap(NAME, handleCallMemberChain)
    hooks.expressionMemberChain.for('process').tap(NAME, handleCallMemberChain)
  }
}

function getExtractMetadata(params: {
  compilation: webpack5.Compilation
  compiler: webpack5.Compiler
  dev: boolean
  metadataByEntry: Map<string, EntryMetadata>
}) {
  const { dev, compilation, metadataByEntry, compiler } = params
  const { webpack: wp } = compiler
  return () => {
    metadataByEntry.clear()

    for (const [entryName, entryData] of compilation.entries) {
      if (entryData.options.runtime !== EDGE_RUNTIME_WEBPACK) {
        // Only process edge runtime entries
        continue
      }

      const { moduleGraph } = compilation
      const entryModules = new Set<webpack5.Module>()
      const addEntriesFromDependency = (dependency: any) => {
        const module = moduleGraph.getModule(dependency)
        if (module) {
          entryModules.add(module)
        }
      }

      entryData.dependencies.forEach(addEntriesFromDependency)
      entryData.includeDependencies.forEach(addEntriesFromDependency)

      const entryMetadata: EntryMetadata = {
        env: new Set<string>(),
        wasmBindings: new Set<WasmBinding>(),
      }

      for (const entryModule of entryModules) {
        const buildInfo = getModuleBuildInfo(entryModule)

        /**
         * When building for production checks if the module is using `eval`
         * and in such case produces a compilation error. The module has to
         * be in use.
         */
        if (
          !dev &&
          buildInfo.usingIndirectEval &&
          isUsingIndirectEvalAndUsedByExports({
            entryModule: entryModule,
            moduleGraph: moduleGraph,
            runtime: wp.util.runtime.getEntryRuntime(compilation, entryName),
            usingIndirectEval: buildInfo.usingIndirectEval,
            wp,
          })
        ) {
          const id = entryModule.identifier()
          if (/node_modules[\\/]regenerator-runtime[\\/]runtime\.js/.test(id)) {
            continue
          }

          const error = new wp.WebpackError(
            `Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Middleware ${entryName}${
              typeof buildInfo.usingIndirectEval !== 'boolean'
                ? `\nUsed by ${Array.from(buildInfo.usingIndirectEval).join(
                    ', '
                  )}`
                : ''
            }`
          )

          error.module = entryModule
          compilation.errors.push(error)
        }

        /**
         * The entry module has to be either a page or a middleware and hold
         * the corresponding metadata.
         */
        if (buildInfo?.nextEdgeSSR) {
          entryMetadata.edgeSSR = buildInfo.nextEdgeSSR
        } else if (buildInfo?.nextEdgeMiddleware) {
          entryMetadata.edgeMiddleware = buildInfo.nextEdgeMiddleware
        }

        /**
         * If there are env vars found in the module, append them to the set
         * of env vars for the entry.
         */
        if (buildInfo?.nextUsedEnvVars !== undefined) {
          for (const envName of buildInfo.nextUsedEnvVars) {
            entryMetadata.env.add(envName)
          }
        }

        /**
         * If the module is a WASM module we read the binding information and
         * append it to the entry wasm bindings.
         */
        if (buildInfo?.nextWasmMiddlewareBinding) {
          entryMetadata.wasmBindings.add(buildInfo.nextWasmMiddlewareBinding)
        }

        /**
         * Append to the list of modules to process outgoingConnections from
         * the module that is being processed.
         */
        for (const conn of moduleGraph.getOutgoingConnections(entryModule)) {
          if (conn.module) {
            entryModules.add(conn.module)
          }
        }
      }

      metadataByEntry.set(entryName, entryMetadata)
    }
  }
}

/**
 * Checks the value of usingIndirectEval and when it is a set of modules it
 * check if any of the modules is actually being used. If the value is
 * simply truthy it will return true.
 */
function isUsingIndirectEvalAndUsedByExports(args: {
  entryModule: webpack5.Module
  moduleGraph: webpack5.ModuleGraph
  runtime: any
  usingIndirectEval: true | Set<string>
  wp: typeof webpack5
}): boolean {
  const { moduleGraph, runtime, entryModule, usingIndirectEval, wp } = args
  if (typeof usingIndirectEval === 'boolean') {
    return usingIndirectEval
  }

  const exportsInfo = moduleGraph.getExportsInfo(entryModule)
  for (const exportName of usingIndirectEval) {
    if (exportsInfo.getUsed(exportName, runtime) !== wp.UsageState.Unused) {
      return true
    }
  }

  return false
}

function getCreateAssets(params: {
  compilation: webpack5.Compilation
  metadataByEntry: Map<string, EntryMetadata>
}) {
  const { compilation, metadataByEntry } = params
  return (assets: any) => {
    for (const entrypoint of compilation.entrypoints.values()) {
      if (!entrypoint.name) {
        continue
      }

      // There should always be metadata for the entrypoint.
      const metadata = metadataByEntry.get(entrypoint.name)
      const page = metadata?.edgeMiddleware?.page || metadata?.edgeSSR?.page
      if (!page) {
        continue
      }

      middlewareManifest.middleware[page] = {
        env: Array.from(metadata.env),
        files: getEntryFiles(entrypoint.getFiles(), metadata),
        name: entrypoint.name,
        page: page,
        regexp: getMiddlewareRegex(page, !metadata.edgeSSR).namedRegex!,
        wasm: Array.from(metadata.wasmBindings),
      }
    }

    middlewareManifest.sortedMiddleware = getSortedRoutes(
      Object.keys(middlewareManifest.middleware)
    )

    middlewareManifest.clientInfo = middlewareManifest.sortedMiddleware.map(
      (key) => [
        key,
        !!metadataByEntry.get(middlewareManifest.middleware[key].name)?.edgeSSR,
      ]
    )

    assets[MIDDLEWARE_MANIFEST] = new sources.RawSource(
      JSON.stringify(middlewareManifest, null, 2)
    )
  }
}

function getEntryFiles(entryFiles: string[], meta: EntryMetadata) {
  const files: string[] = []
  if (meta.edgeSSR) {
    if (meta.edgeSSR.isServerComponent) {
      files.push(`server/${MIDDLEWARE_FLIGHT_MANIFEST}.js`)
    }

    files.push(
      `server/${MIDDLEWARE_BUILD_MANIFEST}.js`,
      `server/${MIDDLEWARE_REACT_LOADABLE_MANIFEST}.js`
    )
  }

  files.push(
    ...entryFiles
      .filter((file) => !file.endsWith('.hot-update.js'))
      .map((file) => 'server/' + file)
  )
  return files
}
