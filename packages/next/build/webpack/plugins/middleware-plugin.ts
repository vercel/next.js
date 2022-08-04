import type {
  AssetBinding,
  EdgeMiddlewareMeta,
} from '../loaders/get-module-build-info'
import type { EdgeSSRMeta } from '../loaders/get-module-build-info'
import { getNamedMiddlewareRegex } from '../../../shared/lib/router/utils/route-regex'
import { getModuleBuildInfo } from '../loaders/get-module-build-info'
import { getSortedRoutes } from '../../../shared/lib/router/utils'
import { webpack, sources, webpack5 } from 'next/dist/compiled/webpack/webpack'
import {
  EDGE_RUNTIME_WEBPACK,
  EDGE_UNSUPPORTED_NODE_APIS,
  MIDDLEWARE_BUILD_MANIFEST,
  FLIGHT_MANIFEST,
  MIDDLEWARE_MANIFEST,
  MIDDLEWARE_REACT_LOADABLE_MANIFEST,
  NEXT_CLIENT_SSR_ENTRY_SUFFIX,
} from '../../../shared/lib/constants'

export interface EdgeFunctionDefinition {
  env: string[]
  files: string[]
  name: string
  page: string
  regexp: string
  wasm?: AssetBinding[]
  assets?: AssetBinding[]
}

export interface MiddlewareManifest {
  version: 1
  sortedMiddleware: string[]
  middleware: { [page: string]: EdgeFunctionDefinition }
  functions: { [page: string]: EdgeFunctionDefinition }
}

interface EntryMetadata {
  edgeMiddleware?: EdgeMiddlewareMeta
  edgeApiFunction?: EdgeMiddlewareMeta
  edgeSSR?: EdgeSSRMeta
  env: Set<string>
  wasmBindings: Map<string, string>
  assetBindings: Map<string, string>
}

const NAME = 'MiddlewarePlugin'
const middlewareManifest: MiddlewareManifest = {
  sortedMiddleware: [],
  middleware: {},
  functions: {},
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
      const codeAnalyzer = getCodeAnalizer({
        dev: this.dev,
        compiler,
        compilation,
      })
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

export async function handleWebpackExtenalForEdgeRuntime({
  request,
  contextInfo,
}: {
  request: string
  contextInfo: any
}) {
  if (contextInfo.issuerLayer === 'middleware' && isNodeJsModule(request)) {
    return `root  globalThis.__import_unsupported('${request}')`
  }
}

function getCodeAnalizer(params: {
  dev: boolean
  compiler: webpack5.Compiler
  compilation: webpack5.Compilation
}) {
  return (parser: webpack5.javascript.JavascriptParser) => {
    const {
      dev,
      compiler: { webpack: wp },
      compilation,
    } = params
    const { hooks } = parser

    /**
     * This expression handler allows to wrap a dynamic code expression with a
     * function call where we can warn about dynamic code not being allowed
     * but actually execute the expression.
     */
    const handleWrapExpression = (expr: any) => {
      if (!isInMiddlewareLayer(parser)) {
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
     * This expression handler allows to wrap a WebAssembly.compile invocation with a
     * function call where we can warn about WASM code generation not being allowed
     * but actually execute the expression.
     */
    const handleWrapWasmCompileExpression = (expr: any) => {
      if (!isInMiddlewareLayer(parser)) {
        return
      }

      if (dev) {
        const { ConstDependency } = wp.dependencies
        const dep1 = new ConstDependency(
          '__next_webassembly_compile__(function() { return ',
          expr.range[0]
        )
        dep1.loc = expr.loc
        parser.state.module.addPresentationalDependency(dep1)
        const dep2 = new ConstDependency('})', expr.range[1])
        dep2.loc = expr.loc
        parser.state.module.addPresentationalDependency(dep2)
      }

      handleExpression()
    }

    /**
     * This expression handler allows to wrap a WebAssembly.instatiate invocation with a
     * function call where we can warn about WASM code generation not being allowed
     * but actually execute the expression.
     *
     * Note that we don't update `usingIndirectEval`, i.e. we don't abort a production build
     * since we can't determine statically if the first parameter is a module (legit use) or
     * a buffer (dynamic code generation).
     */
    const handleWrapWasmInstantiateExpression = (expr: any) => {
      if (!isInMiddlewareLayer(parser)) {
        return
      }

      if (dev) {
        const { ConstDependency } = wp.dependencies
        const dep1 = new ConstDependency(
          '__next_webassembly_instantiate__(function() { return ',
          expr.range[0]
        )
        dep1.loc = expr.loc
        parser.state.module.addPresentationalDependency(dep1)
        const dep2 = new ConstDependency('})', expr.range[1])
        dep2.loc = expr.loc
        parser.state.module.addPresentationalDependency(dep2)
      }
    }

    /**
     * For an expression this will check the graph to ensure it is being used
     * by exports. Then it will store in the module buildInfo a boolean to
     * express that it contains dynamic code and, if it is available, the
     * module path that is using it.
     */
    const handleExpression = () => {
      if (!isInMiddlewareLayer(parser)) {
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
     * Declares an environment variable that is being used in this module
     * through this static analysis.
     */
    const addUsedEnvVar = (envVarName: string) => {
      const buildInfo = getModuleBuildInfo(parser.state.module)
      if (buildInfo.nextUsedEnvVars === undefined) {
        buildInfo.nextUsedEnvVars = new Set()
      }

      buildInfo.nextUsedEnvVars.add(envVarName)
    }

    /**
     * A handler for calls to `process.env` where we identify the name of the
     * ENV variable being assigned and store it in the module info.
     */
    const handleCallMemberChain = (_: unknown, members: string[]) => {
      if (members.length >= 2 && members[0] === 'env') {
        addUsedEnvVar(members[1])
        if (!isInMiddlewareLayer(parser)) {
          return true
        }
      }
    }

    /**
     * A handler for calls to `new Response()` so we can fail if user is setting the response's body.
     */
    const handleNewResponseExpression = (node: any) => {
      const firstParameter = node?.arguments?.[0]
      if (
        isInMiddlewareFile(parser) &&
        firstParameter &&
        !isNullLiteral(firstParameter) &&
        !isUndefinedIdentifier(firstParameter)
      ) {
        const error = buildWebpackError({
          message: `Middleware is returning a response body (line: ${node.loc.start.line}), which is not supported.
Learn more: https://nextjs.org/docs/messages/returning-response-body-in-middleware`,
          compilation,
          parser,
          ...node,
        })
        if (dev) {
          compilation.warnings.push(error)
        } else {
          compilation.errors.push(error)
        }
      }
    }

    /**
     * Handler to store original source location of static and dynamic imports into module's buildInfo.
     */
    const handleImport = (node: any) => {
      if (isInMiddlewareLayer(parser) && node.source?.value && node?.loc) {
        const { module, source } = parser.state
        const buildInfo = getModuleBuildInfo(module)
        if (!buildInfo.importLocByPath) {
          buildInfo.importLocByPath = new Map()
        }

        const importedModule = node.source.value?.toString()!
        buildInfo.importLocByPath.set(importedModule, {
          sourcePosition: {
            ...node.loc.start,
            source: module.identifier(),
          },
          sourceContent: source.toString(),
        })

        if (!dev && isNodeJsModule(importedModule)) {
          compilation.warnings.push(
            buildWebpackError({
              message: `A Node.js module is loaded ('${importedModule}' at line ${node.loc.start.line}) which is not supported in the Edge Runtime.
Learn More: https://nextjs.org/docs/messages/node-module-in-edge-runtime`,
              compilation,
              parser,
              ...node,
            })
          )
        }
      }
    }

    /**
     * A noop handler to skip analyzing some cases.
     * Order matters: for it to work, it must be registered first
     */
    const skip = () => (isInMiddlewareLayer(parser) ? true : undefined)

    for (const prefix of ['', 'global.']) {
      hooks.expression.for(`${prefix}Function.prototype`).tap(NAME, skip)
      hooks.expression.for(`${prefix}Function.bind`).tap(NAME, skip)
      hooks.call.for(`${prefix}eval`).tap(NAME, handleWrapExpression)
      hooks.call.for(`${prefix}Function`).tap(NAME, handleWrapExpression)
      hooks.new.for(`${prefix}Function`).tap(NAME, handleWrapExpression)
      hooks.expression.for(`${prefix}eval`).tap(NAME, handleExpression)
      hooks.expression.for(`${prefix}Function`).tap(NAME, handleExpression)
      hooks.call
        .for(`${prefix}WebAssembly.compile`)
        .tap(NAME, handleWrapWasmCompileExpression)
      hooks.call
        .for(`${prefix}WebAssembly.instantiate`)
        .tap(NAME, handleWrapWasmInstantiateExpression)
    }
    hooks.new.for('Response').tap(NAME, handleNewResponseExpression)
    hooks.new.for('NextResponse').tap(NAME, handleNewResponseExpression)
    hooks.callMemberChain.for('process').tap(NAME, handleCallMemberChain)
    hooks.expressionMemberChain.for('process').tap(NAME, handleCallMemberChain)
    hooks.importCall.tap(NAME, handleImport)
    hooks.import.tap(NAME, handleImport)

    /**
     * Support static analyzing environment variables through
     * destructuring `process.env` or `process["env"]`:
     *
     * const { MY_ENV, "MY-ENV": myEnv } = process.env
     *         ^^^^^^   ^^^^^^
     */
    hooks.declarator.tap(NAME, (declarator) => {
      if (
        declarator.init?.type === 'MemberExpression' &&
        isProcessEnvMemberExpression(declarator.init) &&
        declarator.id?.type === 'ObjectPattern'
      ) {
        for (const property of declarator.id.properties) {
          if (property.type === 'RestElement') continue
          if (
            property.key.type === 'Literal' &&
            typeof property.key.value === 'string'
          ) {
            addUsedEnvVar(property.key.value)
          } else if (property.key.type === 'Identifier') {
            addUsedEnvVar(property.key.name)
          }
        }

        if (!isInMiddlewareLayer(parser)) {
          return true
        }
      }
    })
    if (!dev) {
      // do not issue compilation warning on dev: invoking code will provide details
      registerUnsupportedApiHooks(parser, compilation)
    }
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
        wasmBindings: new Map(),
        assetBindings: new Map(),
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

          compilation.errors.push(
            buildWebpackError({
              message: `Dynamic Code Evaluation (e. g. 'eval', 'new Function', 'WebAssembly.compile') not allowed in Edge Runtime ${
                typeof buildInfo.usingIndirectEval !== 'boolean'
                  ? `\nUsed by ${Array.from(buildInfo.usingIndirectEval).join(
                      ', '
                    )}`
                  : ''
              }`,
              entryModule,
              compilation,
            })
          )
        }

        /**
         * The entry module has to be either a page or a middleware and hold
         * the corresponding metadata.
         */
        if (buildInfo?.nextEdgeSSR) {
          entryMetadata.edgeSSR = buildInfo.nextEdgeSSR
        } else if (buildInfo?.nextEdgeMiddleware) {
          entryMetadata.edgeMiddleware = buildInfo.nextEdgeMiddleware
        } else if (buildInfo?.nextEdgeApiFunction) {
          entryMetadata.edgeApiFunction = buildInfo.nextEdgeApiFunction
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
          entryMetadata.wasmBindings.set(
            buildInfo.nextWasmMiddlewareBinding.name,
            buildInfo.nextWasmMiddlewareBinding.filePath
          )
        }

        if (buildInfo?.nextAssetMiddlewareBinding) {
          entryMetadata.assetBindings.set(
            buildInfo.nextAssetMiddlewareBinding.name,
            buildInfo.nextAssetMiddlewareBinding.filePath
          )
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
      const page =
        metadata?.edgeMiddleware?.page ||
        metadata?.edgeSSR?.page ||
        metadata?.edgeApiFunction?.page
      if (!page) {
        continue
      }

      const { namedRegex } = getNamedMiddlewareRegex(page, {
        catchAll: !metadata.edgeSSR && !metadata.edgeApiFunction,
      })
      const regexp = metadata?.edgeMiddleware?.matcherRegexp || namedRegex

      const edgeFunctionDefinition: EdgeFunctionDefinition = {
        env: Array.from(metadata.env),
        files: getEntryFiles(entrypoint.getFiles(), metadata),
        name: entrypoint.name,
        page: page,
        regexp,
        wasm: Array.from(metadata.wasmBindings, ([name, filePath]) => ({
          name,
          filePath,
        })),
        assets: Array.from(metadata.assetBindings, ([name, filePath]) => ({
          name,
          filePath,
        })),
      }

      if (metadata.edgeApiFunction || metadata.edgeSSR) {
        middlewareManifest.functions[page] = edgeFunctionDefinition
      } else {
        middlewareManifest.middleware[page] = edgeFunctionDefinition
      }
    }

    middlewareManifest.sortedMiddleware = getSortedRoutes(
      Object.keys(middlewareManifest.middleware)
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
      files.push(`server/${FLIGHT_MANIFEST}.js`)
      files.push(
        ...entryFiles
          .filter(
            (file) =>
              file.startsWith('pages/') && !file.endsWith('.hot-update.js')
          )
          .map(
            (file) =>
              'server/' +
              file.replace('.js', NEXT_CLIENT_SSR_ENTRY_SUFFIX + '.js')
          )
      )
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

function registerUnsupportedApiHooks(
  parser: webpack5.javascript.JavascriptParser,
  compilation: webpack5.Compilation
) {
  for (const expression of EDGE_UNSUPPORTED_NODE_APIS) {
    const warnForUnsupportedApi = (node: any) => {
      if (!isInMiddlewareLayer(parser)) {
        return
      }
      compilation.warnings.push(
        buildUnsupportedApiError({
          compilation,
          parser,
          apiName: expression,
          ...node,
        })
      )
      return true
    }
    parser.hooks.call.for(expression).tap(NAME, warnForUnsupportedApi)
    parser.hooks.expression.for(expression).tap(NAME, warnForUnsupportedApi)
    parser.hooks.callMemberChain
      .for(expression)
      .tap(NAME, warnForUnsupportedApi)
    parser.hooks.expressionMemberChain
      .for(expression)
      .tap(NAME, warnForUnsupportedApi)
  }

  const warnForUnsupportedProcessApi = (node: any, [callee]: string[]) => {
    if (!isInMiddlewareLayer(parser) || callee === 'env') {
      return
    }
    compilation.warnings.push(
      buildUnsupportedApiError({
        compilation,
        parser,
        apiName: `process.${callee}`,
        ...node,
      })
    )
    return true
  }

  parser.hooks.callMemberChain
    .for('process')
    .tap(NAME, warnForUnsupportedProcessApi)
  parser.hooks.expressionMemberChain
    .for('process')
    .tap(NAME, warnForUnsupportedProcessApi)
}

function buildUnsupportedApiError({
  apiName,
  loc,
  ...rest
}: {
  apiName: string
  loc: any
  compilation: webpack5.Compilation
  parser: webpack5.javascript.JavascriptParser
}) {
  return buildWebpackError({
    message: `A Node.js API is used (${apiName} at line: ${loc.start.line}) which is not supported in the Edge Runtime.
Learn more: https://nextjs.org/docs/api-reference/edge-runtime`,
    loc,
    ...rest,
  })
}

function buildWebpackError({
  message,
  loc,
  compilation,
  entryModule,
  parser,
}: {
  message: string
  loc?: any
  compilation: webpack5.Compilation
  entryModule?: webpack5.Module
  parser?: webpack5.javascript.JavascriptParser
}) {
  const error = new compilation.compiler.webpack.WebpackError(message)
  error.name = NAME
  const module = entryModule ?? parser?.state.current
  if (module) {
    error.module = module
  }
  error.loc = loc
  return error
}

function isInMiddlewareLayer(parser: webpack5.javascript.JavascriptParser) {
  return parser.state.module?.layer === 'middleware'
}

function isInMiddlewareFile(parser: webpack5.javascript.JavascriptParser) {
  return (
    parser.state.current?.layer === 'middleware' &&
    /middleware\.\w+$/.test(parser.state.current?.rawRequest)
  )
}

function isNullLiteral(expr: any) {
  return expr.value === null
}

function isUndefinedIdentifier(expr: any) {
  return expr.name === 'undefined'
}

function isProcessEnvMemberExpression(memberExpression: any): boolean {
  return (
    memberExpression.object?.type === 'Identifier' &&
    memberExpression.object.name === 'process' &&
    ((memberExpression.property?.type === 'Literal' &&
      memberExpression.property.value === 'env') ||
      (memberExpression.property?.type === 'Identifier' &&
        memberExpression.property.name === 'env'))
  )
}

function isNodeJsModule(moduleName: string) {
  return require('module').builtinModules.includes(moduleName)
}
