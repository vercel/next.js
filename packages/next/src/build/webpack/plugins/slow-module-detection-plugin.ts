import type { Compiler, Module, Compilation } from 'webpack'
import type { CompilerNameValues } from '../../../shared/lib/constants'
import { getModuleBuildInfo } from '../loaders/get-module-build-info'
import { yellow, green, blue } from '../../../lib/picocolors'

const PLUGIN_NAME = 'SlowModuleDetectionPlugin'

const TreeSymbols = {
  VERTICAL_LINE: '│  ',
  BRANCH: '├─ ',
} as const

const DEFAULT_SLOW_MODULE_THRESHOLD_MS = 500

const DEFAULT_PATH_TRUNCATION_LENGTH = 100

// Matches node_modules paths, including pnpm-style paths
const NODE_MODULES_PATH_PATTERN = /node_modules(?:\/\.pnpm)?\/(.*)/

interface ModuleBuildTimeAnalyzerOptions {
  compilerType: CompilerNameValues
  slowModuleThresholdMs?: number
  pathTruncationLength?: number
}

const getModuleIdentifier = (module: Module): string => {
  const debugId = module.debugId
  if (!debugId) {
    throw new Error(
      `Invariant: Module is missing a required debugId. This is a Next.js internal bug.`
    )
  }
  return String(debugId)
}

const getModuleDisplayName = (module: Module): string | undefined => {
  const resourcePath =
    'resource' in module && typeof module.resource === 'string'
      ? module.resource
      : undefined

  if (!resourcePath) {
    return undefined
  }

  let displayPath = resourcePath.replace(process.cwd(), '.')

  const nodeModulesMatch = displayPath.match(NODE_MODULES_PATH_PATTERN)
  if (nodeModulesMatch) {
    return nodeModulesMatch[1]
  }

  return displayPath
}

/**
 * Analyzes module build times and creates a dependency tree of slow modules.
 * Uses a graph data structure to track module relationships:
 * - pendingModules: List of modules that exceeded the slow threshold
 * - modules: Map of all modules by ID that are either slow or ancestors of slow modules
 * - moduleParents/moduleChildren: Bidirectional edges between modules
 */
class ModuleBuildTimeAnalyzer {
  private pendingModules: Module[] = []
  private modules = new Map<string, Module>()
  private moduleParents = new Map<Module, Module>()
  private moduleChildren = new Map<Module, Map<string, Module>>()
  private isFinalized = false
  private slowModuleThresholdMs: number
  private pathTruncationLength: number

  constructor(private options: ModuleBuildTimeAnalyzerOptions) {
    this.slowModuleThresholdMs =
      options.slowModuleThresholdMs ?? DEFAULT_SLOW_MODULE_THRESHOLD_MS
    this.pathTruncationLength =
      options.pathTruncationLength ?? DEFAULT_PATH_TRUNCATION_LENGTH
  }

  recordModuleBuildTime(module: Module, duration: number) {
    if (this.isFinalized) {
      throw new Error(
        `Invariant: Module is recorded after the report is generated. This is a Next.js internal bug.`
      )
    }

    if (duration < this.slowModuleThresholdMs) {
      return // Skip fast modules
    }

    getModuleBuildInfo(module).slowModuleDetectionTiming = duration
    this.pendingModules.push(module)
  }

  /**
   * For each slow module, traverses up the dependency chain to find all ancestor modules.
   * Builds a directed graph where:
   * 1. Each slow module and its ancestors become nodes
   * 2. Edges represent "imported by" relationships
   * 3. Root nodes are entry points with no parents
   *
   * The resulting graph allows us to visualize the import chains that led to slow builds.
   */
  private prepareReport(compilation: Compilation) {
    for (const module of this.pendingModules) {
      // Track visited modules to detect circular dependencies
      const chain: Module[] = []
      const visitedModules = new Set<Module>()
      let currentModule = module

      chain.push(currentModule)
      visitedModules.add(currentModule)

      // Walk up the module graph until we hit a root module (no issuer)
      while (true) {
        const issuerModule = compilation.moduleGraph.getIssuer(currentModule)
        if (!issuerModule) break
        if (visitedModules.has(issuerModule)) {
          throw new Error(
            `Invariant: Circular dependency detected in module graph. This is a Next.js internal bug.`
          )
        }
        chain.push(issuerModule)
        visitedModules.add(issuerModule)
        currentModule = issuerModule
      }

      // Add all modules in the chain to our graph
      const modulesInChain: Module[] = []
      for (const moduleInChain of chain) {
        const moduleId = getModuleIdentifier(moduleInChain)
        if (!this.modules.has(moduleId)) {
          this.modules.set(moduleId, moduleInChain)
        }
        modulesInChain.push(moduleInChain)
      }

      // Create parent-child relationships between adjacent modules in the chain
      for (let i = 0; i < modulesInChain.length - 1; i++) {
        const child = modulesInChain[i]
        const parent = modulesInChain[i + 1]

        this.moduleParents.set(child, parent)

        let parentChildren = this.moduleChildren.get(parent)
        if (!parentChildren) {
          parentChildren = new Map()
          this.moduleChildren.set(parent, parentChildren)
        }
        parentChildren.set(getModuleIdentifier(child), child)
      }
    }

    this.isFinalized = true
  }

  generateReport(compilation: Compilation) {
    if (!this.isFinalized) {
      this.prepareReport(compilation)
    }

    // Find root modules (those with no parents)
    const rootModules = [...this.modules.values()].filter(
      (node) => !this.moduleParents.has(node)
    )

    // Truncates long paths by keeping start and end portions
    const truncatePath = (
      path: string,
      maxLength = this.pathTruncationLength
    ): string => {
      if (path.length <= maxLength) return path
      const startSegment = path.slice(0, maxLength / 3)
      const endSegment = path.slice((-maxLength * 2) / 3)
      return `${startSegment}...${endSegment}`
    }

    const formatModuleNode = (node: Module, depth: number): string => {
      const moduleName = getModuleDisplayName(node) || ''

      if (!moduleName) {
        return formatChildModules(node, depth)
      }

      const buildInfo = getModuleBuildInfo(node)
      const buildTimeMs = buildInfo.slowModuleDetectionTiming

      const duration =
        buildTimeMs && buildTimeMs > 0
          ? yellow(` (${Math.ceil(buildTimeMs)}ms)`)
          : ''

      const indentation = ' ' + TreeSymbols.VERTICAL_LINE.repeat(depth)
      const moduleText = blue(truncatePath(moduleName))

      return (
        indentation +
        TreeSymbols.BRANCH +
        moduleText +
        duration +
        '\n' +
        formatChildModules(node, depth + 1)
      )
    }

    const formatChildModules = (node: Module, depth: number): string => {
      const children = this.moduleChildren.get(node)
      if (!children) return ''

      return [...children]
        .map(([_, child]) => formatModuleNode(child, depth))
        .join('')
    }

    const report = rootModules.map((root) => formatModuleNode(root, 0)).join('')

    if (report) {
      console.log(
        green(
          `🐌 Detected slow modules while compiling ${this.options.compilerType}:`
        ) +
          '\n' +
          report
      )
    }
  }
}

export default class SlowModuleDetectionPlugin {
  constructor(private options: ModuleBuildTimeAnalyzerOptions) {}

  apply = (compiler: Compiler) => {
    compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
      const analyzer = new ModuleBuildTimeAnalyzer(this.options)
      const moduleBuildStartTimes = new WeakMap<Module, number>()

      compilation.hooks.buildModule.tap(PLUGIN_NAME, (module) => {
        moduleBuildStartTimes.set(module, performance.now())
      })

      compilation.hooks.succeedModule.tap(PLUGIN_NAME, (module) => {
        const startTime = moduleBuildStartTimes.get(module)
        if (!startTime) {
          throw new Error(
            `Invariant: Unable to find the start time for a module build. This is a Next.js internal bug.`
          )
        }
        analyzer.recordModuleBuildTime(module, performance.now() - startTime)
      })

      compilation.hooks.finishModules.tap(PLUGIN_NAME, () => {
        analyzer.generateReport(compilation)
      })
    })
  }
}
