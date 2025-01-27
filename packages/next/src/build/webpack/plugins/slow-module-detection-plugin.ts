import type { Compiler, Module, Compilation } from 'webpack'
import type { CompilerNameValues } from '../../../shared/lib/constants'

/**
 * Plugin that detects and reports modules that take a long time to build.
 * Helps identify performance bottlenecks in the build process by:
 * 1. Tracking build time for each module
 * 2. Building a dependency tree of slow modules
 * 3. Generating a visual report with timing information
 */

// Configuration constants
const PLUGIN_NAME = 'SlowModuleDetectionPlugin'

// Console output styling - using ANSI escape codes for colors
const ConsoleColors = {
  BOLD_BLUE: '\x1b[1;34m',
  BRIGHT_YELLOW: '\x1b[93m',
  BOLD_GREEN: '\x1b[1;32m',
  RESET: '\x1b[0m',
} as const

// Tree visualization characters for the dependency tree output
const TreeSymbols = {
  VERTICAL_LINE: '│  ', // Used for showing depth levels
  BRANCH: '├─ ', // Used for showing module connections
} as const

// Matches node_modules paths, including pnpm-style paths (.pnpm folder)
const NODE_MODULES_PATH_PATTERN = /node_modules(?:\/\.pnpm)?\/(.*)/

interface ModuleBuildTimeAnalyzerOptions {
  compilerType: CompilerNameValues
  slowModuleThresholdMs?: number
  pathTruncationLength?: number
}

interface ModuleNode {
  module: Module
  buildDuration: number // Time taken to build this module in milliseconds
}

/**
 * Gets a unique identifier for a module based on its debugId.
 * The debugId is a webpack-internal identifier that's guaranteed unique per module.
 */
const getModuleIdentifier = (module: Module): string => {
  const debugId = module.debugId
  if (!debugId) {
    throw new Error(
      "Unable to identify module: The module is missing a required debugId. This may indicate a problem with webpack's internal module tracking."
    )
  }
  return String(debugId)
}

/**
 * Extracts a clean, readable module name from its resource path.
 * Handles both project files and node_modules:
 * - Project files: Converts absolute paths to project-relative paths
 * - node_modules: Simplifies to just the package path
 */
const getModuleDisplayName = (module: Module): string | undefined => {
  const resourcePath = (module as any).resource
  if (!resourcePath) {
    return undefined
  }

  // Convert absolute paths to project-relative paths for readability
  let displayPath = resourcePath.replace(process.cwd(), '.')

  // Simplify node_modules paths to just show the package path
  const nodeModulesMatch = displayPath.match(NODE_MODULES_PATH_PATTERN)
  if (nodeModulesMatch) {
    return nodeModulesMatch[1]
  }

  return displayPath
}

/**
 * Creates a new module node with initial build duration of 0
 */
const createModuleNode = (module: Module): ModuleNode => {
  return {
    module,
    buildDuration: 0,
  }
}

/**
 * Tracks and analyzes module build times to generate a dependency tree report.
 * The analyzer maintains several data structures:
 * - pendingModules: Modules waiting to be processed
 * - moduleNodes: Map of all module nodes by ID
 * - moduleParents/Children: Bidirectional relationships between modules
 */
class ModuleBuildTimeAnalyzer {
  private pendingModules: [Module, number, Compilation][] = []
  private moduleNodes = new Map<string, ModuleNode>()
  private moduleParents = new Map<ModuleNode, ModuleNode>()
  private moduleChildren = new Map<ModuleNode, Map<string, ModuleNode>>()
  private isFinalized = false
  private slowModuleThresholdMs: number
  private pathTruncationLength: number

  constructor(private options: ModuleBuildTimeAnalyzerOptions) {
    this.slowModuleThresholdMs = options.slowModuleThresholdMs ?? 500
    this.pathTruncationLength = options.pathTruncationLength ?? 100
  }

  recordModuleBuildTime(
    module: Module,
    duration: number,
    compilation: Compilation
  ) {
    if (this.isFinalized) {
      throw new Error(
        '[SlowModuleDetectionPlugin] Cannot record additional build times: The analysis has already been finalized.'
      )
    }
    if (duration < this.slowModuleThresholdMs) {
      return // Skip fast modules to reduce noise
    }

    this.pendingModules.push([module, duration, compilation])
  }

  private generateDependencyGraph() {
    if (this.isFinalized) {
      throw new Error(
        '[SlowModuleDetectionPlugin] Cannot regenerate dependency graph: The graph has already been generated.'
      )
    }

    for (const [module, duration, compilation] of this.pendingModules) {
      // Build dependency chain by walking up the module graph
      const chain: Module[] = []
      const { moduleGraph } = compilation
      const visitedModules = new Set<Module>()
      let currentModule = module

      chain.push(currentModule)
      visitedModules.add(currentModule)

      while (true) {
        const issuerModule = moduleGraph.getIssuer(currentModule)
        if (!issuerModule) break
        if (visitedModules.has(issuerModule)) {
          throw new Error(
            '[SlowModuleDetectionPlugin] Circular dependency detected in module graph.'
          )
        }
        chain.push(issuerModule)
        visitedModules.add(issuerModule)
        currentModule = issuerModule
      }

      const moduleNodes: ModuleNode[] = []

      // Create or reuse nodes for each module in the chain
      for (const mod of chain) {
        let node = this.moduleNodes.get(getModuleIdentifier(mod))
        if (!node) {
          node = createModuleNode(mod)
          this.moduleNodes.set(getModuleIdentifier(mod), node)
        }
        moduleNodes.push(node)
      }

      // Add the build time to the module that triggered the build
      if (moduleNodes.length) {
        moduleNodes[0].buildDuration += duration
      }

      // Build the parent-child relationships for the dependency tree
      for (let i = 0; i < moduleNodes.length - 1; i++) {
        const child = moduleNodes[i]
        const parent = moduleNodes[i + 1]

        this.moduleParents.set(child, parent)

        let parentChildren = this.moduleChildren.get(parent)
        if (!parentChildren) {
          parentChildren = new Map()
          this.moduleChildren.set(parent, parentChildren)
        }
        parentChildren.set(getModuleIdentifier(child.module), child)
      }
    }

    this.isFinalized = true
  }

  /**
   * Generates a visual tree report of slow modules and their relationships.
   * The tree shows:
   * - Module paths (truncated if too long)
   * - Build durations (in yellow)
   * - Module relationships (using tree symbols)
   */
  generateReport() {
    this.generateDependencyGraph()

    if (!this.isFinalized) {
      throw new Error(
        '[SlowModuleDetectionPlugin] Cannot generate performance report: The module analysis has not been finalized.'
      )
    }

    // Find root modules (those with no parents)
    const rootModules = [...this.moduleNodes.values()].filter(
      (node) => !this.moduleParents.has(node)
    )

    // Helper to truncate long paths for better readability
    const truncatePath = (
      path: string,
      maxLength = this.pathTruncationLength
    ): string => {
      if (path.length <= maxLength) return path
      const startSegment = path.slice(0, maxLength / 3)
      const endSegment = path.slice((-maxLength * 2) / 3)
      return `${startSegment}...${endSegment}`
    }

    // Helper to format duration with consistent padding
    const formatDuration = (ms: number): string => {
      return `${ms}ms`.padStart(5)
    }

    // Recursively format a module and its children
    const formatModuleNode = (node: ModuleNode, depth: number): string => {
      const moduleName = getModuleDisplayName(node.module) || ''

      if (!moduleName) {
        return formatChildModules(node, depth)
      }

      const truncatedName = truncatePath(moduleName)
      const indentation = TreeSymbols.VERTICAL_LINE.repeat(depth)

      const duration =
        node.buildDuration > 0
          ? `(${ConsoleColors.BRIGHT_YELLOW}${formatDuration(node.buildDuration)}${ConsoleColors.RESET})`
          : ''
      const nameWithStyle = `${ConsoleColors.BOLD_BLUE}${truncatedName}${ConsoleColors.RESET}`
      const line = `${indentation}${TreeSymbols.BRANCH}${nameWithStyle} ${duration}`

      return ` ${line}\n${formatChildModules(node, depth + 1)}`
    }

    // Format all children of a module
    const formatChildModules = (node: ModuleNode, depth: number): string => {
      const children = this.moduleChildren.get(node)
      if (!children) return ''

      return [...children]
        .map(([_, child]) => formatModuleNode(child, depth))
        .join('')
    }

    // Build the complete report
    let report = ''
    for (const root of rootModules) {
      report += formatModuleNode(root, 0)
    }

    // Only output if there are slow modules to report
    if (report) {
      console.log(
        `${ConsoleColors.BOLD_GREEN}🐌 Detected slow modules while compiling ${this.options.compilerType}:${ConsoleColors.RESET}`
      )
      console.log(report)
    }
  }
}

/**
 * Webpack plugin that analyzes and reports modules that are slow to build.
 * Hooks into webpack's compilation process to:
 * 1. Track when module builds start
 * 2. Record build durations when modules complete
 * 3. Generate a report when compilation is done
 */
export default class SlowModuleDetectionPlugin {
  private analyzer: ModuleBuildTimeAnalyzer | null = null
  private moduleBuildStartTimes = new WeakMap<Module, number>()

  constructor(private options: ModuleBuildTimeAnalyzerOptions) {}

  apply = (compiler: Compiler) => {
    compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
      this.analyzer = new ModuleBuildTimeAnalyzer(this.options)

      // Record start time when module build begins
      compilation.hooks.buildModule.tap(PLUGIN_NAME, (module) => {
        this.moduleBuildStartTimes.set(module, Date.now())
      })

      // Calculate and record duration when module build succeeds
      compilation.hooks.succeedModule.tap(PLUGIN_NAME, (module) => {
        const startTime = this.moduleBuildStartTimes.get(module)
        if (!startTime) {
          throw new Error(
            '[SlowModuleDetectionPlugin] Module build timing error: Unable to find the start time for a module build.'
          )
        }
        if (!this.analyzer) {
          throw new Error(
            '[SlowModuleDetectionPlugin] Module analyzer initialization error: The analyzer was not properly initialized.'
          )
        }
        this.analyzer.recordModuleBuildTime(
          module,
          Date.now() - startTime,
          compilation
        )
      })
    })

    // Generate the report when compilation is complete
    compiler.hooks.done.tap(PLUGIN_NAME, () => {
      if (!this.analyzer) {
        return // No modules were built
      }
      this.analyzer.generateReport()
    })
  }
}
