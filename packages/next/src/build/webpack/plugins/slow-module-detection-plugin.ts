import type { Compiler, Module, Compilation } from 'webpack'
import type { CompilerNameValues } from '../../../shared/lib/constants'
import { yellow, green, blue } from '../../../lib/picocolors'

const PLUGIN_NAME = 'SlowModuleDetectionPlugin'

const TreeSymbols = {
  VERTICAL_LINE: '│  ',
  BRANCH: '├─ ',
} as const

const PATH_TRUNCATION_LENGTH = 120

// Matches node_modules paths, including pnpm-style paths
const NODE_MODULES_PATH_PATTERN = /node_modules(?:\/\.pnpm)?\/(.*)/

interface ModuleBuildTimeAnalyzerOptions {
  compilerType: CompilerNameValues
  buildTimeThresholdMs: number
}

const getModuleIdentifier = (module: Module): string => {
  const debugId = module.debugId
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
 * Truncates a path to a maximum length. If the path exceeds this length,
 * it will be truncated in the middle and replaced with '...'.
 */
function truncatePath(path: string, maxLength: number): string {
  // If the path length is within the limit, return it as is
  if (path.length <= maxLength) return path

  // Calculate the available length for the start and end segments after accounting for '...'
  const availableLength = maxLength - 3
  const startSegmentLength = Math.ceil(availableLength / 2)
  const endSegmentLength = Math.floor(availableLength / 2)

  // Extract the start and end segments of the path
  const startSegment = path.slice(0, startSegmentLength)
  const endSegment = path.slice(-endSegmentLength)

  // Return the truncated path with '...' in the middle
  return `${startSegment}...${endSegment}`
}

class ModuleBuildTimeAnalyzer {
  private pendingModules: Module[] = []
  private modules = new Map<string, Module>()
  private moduleParents = new Map<Module, Module>()
  private moduleChildren = new Map<Module, Map<string, Module>>()
  private isFinalized = false
  private buildTimeThresholdMs: number
  private moduleBuildTimes = new WeakMap<Module, number>()

  constructor(private options: ModuleBuildTimeAnalyzerOptions) {
    this.buildTimeThresholdMs = options.buildTimeThresholdMs
  }

  recordModuleBuildTime(module: Module, duration: number) {
    // Webpack guarantees that no more modules will be built after finishModules hook is called,
    // where we generate the report. This check is just a defensive measure.
    if (this.isFinalized) {
      throw new Error(
        `Invariant (SlowModuleDetectionPlugin): Module is recorded after the report is generated. This is a Next.js internal bug.`
      )
    }

    if (duration < this.buildTimeThresholdMs) {
      return // Skip fast modules
    }

    this.moduleBuildTimes.set(module, duration)
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
      const chain = new Set<Module>()

      // Walk up the module graph until we hit a root module (no issuer) to populate the chain
      {
        let currentModule = module
        chain.add(currentModule)
        while (true) {
          const issuerModule = compilation.moduleGraph.getIssuer(currentModule)
          if (!issuerModule) break
          if (chain.has(issuerModule)) {
            throw new Error(
              `Invariant (SlowModuleDetectionPlugin): Circular dependency detected in module graph. This is a Next.js internal bug.`
            )
          }
          chain.add(issuerModule)
          currentModule = issuerModule
        }
      }

      // Add all visited modules to our graph and create parent-child relationships
      let previousModule: Module | null = null
      for (const currentModule of chain) {
        const moduleId = getModuleIdentifier(currentModule)
        if (!this.modules.has(moduleId)) {
          this.modules.set(moduleId, currentModule)
        }

        if (previousModule) {
          this.moduleParents.set(previousModule, currentModule)

          let parentChildren = this.moduleChildren.get(currentModule)
          if (!parentChildren) {
            parentChildren = new Map()
            this.moduleChildren.set(currentModule, parentChildren)
          }
          parentChildren.set(
            getModuleIdentifier(previousModule),
            previousModule
          )
        }

        previousModule = currentModule
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

    const formatModuleNode = (node: Module, depth: number): string => {
      const moduleName = getModuleDisplayName(node) || ''

      if (!moduleName) {
        return formatChildModules(node, depth)
      }

      const prefix =
        ' ' + TreeSymbols.VERTICAL_LINE.repeat(depth) + TreeSymbols.BRANCH

      const moduleText = blue(
        truncatePath(moduleName, PATH_TRUNCATION_LENGTH - prefix.length)
      )

      const buildTimeMs = this.moduleBuildTimes.get(node)
      const duration = buildTimeMs
        ? yellow(` (${Math.ceil(buildTimeMs)}ms)`)
        : ''

      return (
        prefix +
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
            `Invariant (SlowModuleDetectionPlugin): Unable to find the start time for a module build. This is a Next.js internal bug.`
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
