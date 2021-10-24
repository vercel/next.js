import type { webpack5 as webpack } from 'next/dist/compiled/webpack/webpack'

type Feature = 'next/image' | 'next/script' | 'next/dynamic'

interface FeatureUsage {
  featureName: Feature
  invocationCount: number
}

/**
 * A vertex in the module graph.
 */
interface Module {
  type: string
  identifier(): string
}

/**
 * An edge in the module graph.
 */
interface Connection {
  originModule: unknown
}

// Map of a feature module to the file it belongs in the next package.
const FEATURE_MODULE_MAP: ReadonlyMap<Feature, string> = new Map([
  ['next/image', '/next/image.js'],
  ['next/script', '/next/script.js'],
  ['next/dynamic', '/next/dynamic.js'],
])

/**
 * Plugin that queries the ModuleGraph to look for modules that correspond to
 * certain features (e.g. next/image and next/script) and record how many times
 * they are imported.
 */
export class TelemetryPlugin implements webpack.WebpackPluginInstance {
  private usageTracker = new Map<Feature, FeatureUsage>()

  constructor() {
    for (const featureName of FEATURE_MODULE_MAP.keys()) {
      this.usageTracker.set(featureName, {
        featureName,
        invocationCount: 0,
      })
    }
  }

  apply(compiler: webpack.Compiler): void {
    compiler.hooks.make.tapAsync(
      TelemetryPlugin.name,
      async (compilation: webpack.Compilation, callback: () => void) => {
        compilation.hooks.finishModules.tapAsync(
          TelemetryPlugin.name,
          async (modules: Iterable<Module>, modulesFinish: () => void) => {
            for (const module of modules) {
              const feature = findFeatureInModule(module)
              if (!feature) {
                continue
              }
              const connections = (
                compilation as any
              ).moduleGraph.getIncomingConnections(module)
              const originModules =
                findUniqueOriginModulesInConnections(connections)
              this.usageTracker.get(feature)!.invocationCount =
                originModules.size
            }
            modulesFinish()
          }
        )
        callback()
      }
    )
  }

  usages(): FeatureUsage[] {
    return [...this.usageTracker.values()]
  }
}

/**
 * Determine if there is a feature of interest in the specified 'module'.
 */
function findFeatureInModule(module: Module): Feature | undefined {
  if (module.type !== 'javascript/auto') {
    return
  }
  for (const [feature, path] of FEATURE_MODULE_MAP) {
    if (module.identifier().replace(/\\/g, '/').endsWith(path)) {
      return feature
    }
  }
}

/**
 * Find unique origin modules in the specified 'connections', which possibly
 * contains more than one connection for a module due to different types of
 * dependency.
 */
function findUniqueOriginModulesInConnections(
  connections: Connection[]
): Set<unknown> {
  const originModules = new Set()
  for (const connection of connections) {
    if (!originModules.has(connection.originModule)) {
      originModules.add(connection.originModule)
    }
  }
  return originModules
}
