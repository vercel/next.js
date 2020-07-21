// eslint-disable-next-line import/no-extraneous-dependencies
import { NodePath } from 'ast-types/lib/node-path'
import { visit } from 'next/dist/compiled/recast'
import { compilation as CompilationType, Compiler } from 'webpack'
import {
  IConformanceAnomaly,
  IConformanceTestResult,
  IConformanceTestStatus,
  IGetAstNodeResult,
  IWebpackConformanceTest,
  NodeInspector,
} from './TestInterface'

export { DuplicatePolyfillsConformanceCheck } from './checks/duplicate-polyfills-conformance-check'
export { GranularChunksConformanceCheck } from './checks/granular-chunks-conformance'
export { MinificationConformanceCheck } from './checks/minification-conformance-check'
export { ReactSyncScriptsConformanceCheck } from './checks/react-sync-scripts-conformance-check'

export interface IWebpackConformancePluginOptions {
  tests: IWebpackConformanceTest[]
}

interface VisitorMap {
  [key: string]: (path: NodePath) => void
}

export default class WebpackConformancePlugin {
  private tests: IWebpackConformanceTest[]
  private errors: Array<IConformanceAnomaly>
  private warnings: Array<IConformanceAnomaly>
  private compiler?: Compiler

  constructor(options: IWebpackConformancePluginOptions) {
    this.tests = []
    if (options.tests) {
      this.tests.push(...options.tests)
    }
    this.errors = []
    this.warnings = []
  }

  private gatherResults(results: Array<IConformanceTestResult>): void {
    results.forEach((result) => {
      if (result.result === IConformanceTestStatus.FAILED) {
        result.errors && this.errors.push(...result.errors)
        result.warnings && this.warnings.push(...result.warnings)
      }
    })
  }

  private buildStartedHandler = (
    _compilation: CompilationType.Compilation,
    callback: () => void
  ) => {
    const buildStartedResults: IConformanceTestResult[] = this.tests.map(
      (test) => {
        if (test.buildStared && this.compiler) {
          return test.buildStared(this.compiler.options)
        }
        return {
          result: IConformanceTestStatus.SUCCESS,
        } as IConformanceTestResult
      }
    )

    this.gatherResults(buildStartedResults)
    callback()
  }

  private buildCompletedHandler = (
    compilation: CompilationType.Compilation,
    cb: () => void
  ): void => {
    const buildCompletedResults: IConformanceTestResult[] = this.tests.map(
      (test) => {
        if (test.buildCompleted) {
          return test.buildCompleted(compilation.assets)
        }
        return {
          result: IConformanceTestStatus.SUCCESS,
        } as IConformanceTestResult
      }
    )

    this.gatherResults(buildCompletedResults)
    compilation.errors.push(...this.errors)
    compilation.warnings.push(...this.warnings)
    cb()
  }

  private parserHandler = (
    factory: CompilationType.NormalModuleFactory
  ): void => {
    const JS_TYPES = ['auto', 'esm', 'dynamic']
    const collectedVisitors: Map<string, [NodeInspector?]> = new Map()
    // Collect all interested visitors from all tests.
    this.tests.forEach((test) => {
      if (test.getAstNode) {
        const getAstNodeCallbacks: IGetAstNodeResult[] = test.getAstNode()
        getAstNodeCallbacks.forEach((result) => {
          if (!collectedVisitors.has(result.visitor)) {
            collectedVisitors.set(result.visitor, [])
          }
          ;(collectedVisitors.get(result.visitor) as NodeInspector[]).push(
            result.inspectNode
          )
        })
      }
    })

    // Do an extra walk per module and add interested visitors to the walk.
    for (const type of JS_TYPES) {
      factory.hooks.parser
        .for('javascript/' + type)
        .tap(this.constructor.name, (parser: any) => {
          parser.hooks.program.tap(this.constructor.name, (ast: any) => {
            const visitors: VisitorMap = {}
            const that = this
            for (const visitorKey of collectedVisitors.keys()) {
              visitors[visitorKey] = function (path: NodePath) {
                const callbacks = collectedVisitors.get(visitorKey) || []
                callbacks.forEach((cb) => {
                  if (!cb) {
                    return
                  }
                  const { request } = parser.state.module
                  const outcome = cb(path, { request })
                  that.gatherResults([outcome])
                })
                this.traverse(path)
                return false
              }
            }
            visit(ast, visitors)
          })
        })
    }
  }

  public apply(compiler: Compiler) {
    this.compiler = compiler
    compiler.hooks.make.tapAsync(
      this.constructor.name,
      this.buildStartedHandler
    )
    compiler.hooks.emit.tapAsync(
      this.constructor.name,
      this.buildCompletedHandler
    )
    compiler.hooks.normalModuleFactory.tap(
      this.constructor.name,
      this.parserHandler
    )
  }
}
