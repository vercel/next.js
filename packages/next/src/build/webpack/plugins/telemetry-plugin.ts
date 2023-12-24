import type { webpack } from 'next/dist/compiled/webpack/webpack'
import { NormalModule } from 'next/dist/compiled/webpack/webpack'

/**
 * List of target triples next-swc native binary supports.
 */
export type SWC_TARGET_TRIPLE =
  | 'x86_64-apple-darwin'
  | 'x86_64-unknown-linux-gnu'
  | 'x86_64-pc-windows-msvc'
  | 'i686-pc-windows-msvc'
  | 'aarch64-unknown-linux-gnu'
  | 'armv7-unknown-linux-gnueabihf'
  | 'aarch64-apple-darwin'
  | 'aarch64-linux-android'
  | 'arm-linux-androideabi'
  | 'x86_64-unknown-freebsd'
  | 'x86_64-unknown-linux-musl'
  | 'aarch64-unknown-linux-musl'
  | 'aarch64-pc-windows-msvc'

export type Feature =
  | 'next/image'
  | 'next/future/image'
  | 'next/legacy/image'
  | 'next/script'
  | 'next/dynamic'
  | '@next/font/google'
  | '@next/font/local'
  | 'next/font/google'
  | 'next/font/local'
  | 'swcLoader'
  | 'swcMinify'
  | 'swcRelay'
  | 'swcStyledComponents'
  | 'swcReactRemoveProperties'
  | 'swcExperimentalDecorators'
  | 'swcRemoveConsole'
  | 'swcImportSource'
  | 'swcEmotion'
  | `swc/target/${SWC_TARGET_TRIPLE}`
  | 'turbotrace'
  | 'transpilePackages'
  | 'skipMiddlewareUrlNormalize'
  | 'skipTrailingSlashRedirect'
  | 'modularizeImports'

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
  ['next/future/image', '/next/future/image.js'],
  ['next/legacy/image', '/next/legacy/image.js'],
  ['next/script', '/next/script.js'],
  ['next/dynamic', '/next/dynamic.js'],
])
const FEATURE_MODULE_REGEXP_MAP: ReadonlyMap<Feature, RegExp> = new Map([
  ['@next/font/google', /\/@next\/font\/google\/target.css?.+$/],
  ['@next/font/local', /\/@next\/font\/local\/target.css?.+$/],
  ['next/font/google', /\/next\/font\/google\/target.css?.+$/],
  ['next/font/local', /\/next\/font\/local\/target.css?.+$/],
])

// List of build features used in webpack configuration
const BUILD_FEATURES: Array<Feature> = [
  'swcLoader',
  'swcMinify',
  'swcRelay',
  'swcStyledComponents',
  'swcReactRemoveProperties',
  'swcExperimentalDecorators',
  'swcRemoveConsole',
  'swcImportSource',
  'swcEmotion',
  'swc/target/x86_64-apple-darwin',
  'swc/target/x86_64-unknown-linux-gnu',
  'swc/target/x86_64-pc-windows-msvc',
  'swc/target/i686-pc-windows-msvc',
  'swc/target/aarch64-unknown-linux-gnu',
  'swc/target/armv7-unknown-linux-gnueabihf',
  'swc/target/aarch64-apple-darwin',
  'swc/target/aarch64-linux-android',
  'swc/target/arm-linux-androideabi',
  'swc/target/x86_64-unknown-freebsd',
  'swc/target/x86_64-unknown-linux-musl',
  'swc/target/aarch64-unknown-linux-musl',
  'swc/target/aarch64-pc-windows-msvc',
  'turbotrace',
  'transpilePackages',
  'skipMiddlewareUrlNormalize',
  'skipTrailingSlashRedirect',
  'modularizeImports',
]

const eliminatedPackages = new Set<string>()

/**
 * Determine if there is a feature of interest in the specified 'module'.
 */
function findFeatureInModule(module: Module): Feature | undefined {
  if (module.type !== 'javascript/auto') {
    return
  }
  const normalizedIdentifier = module.identifier().replace(/\\/g, '/')
  for (const [feature, path] of FEATURE_MODULE_MAP) {
    if (normalizedIdentifier.endsWith(path)) {
      return feature
    }
  }
  for (const [feature, regexp] of FEATURE_MODULE_REGEXP_MAP) {
    if (regexp.test(normalizedIdentifier)) {
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
  connections: Connection[],
  originModule: Module
): Set<unknown> {
  const originModules = new Set()
  for (const connection of connections) {
    if (
      !originModules.has(connection.originModule) &&
      connection.originModule !== originModule
    ) {
      originModules.add(connection.originModule)
    }
  }
  return originModules
}

/**
 * Plugin that queries the ModuleGraph to look for modules that correspond to
 * certain features (e.g. next/image and next/script) and record how many times
 * they are imported.
 */
export class TelemetryPlugin implements webpack.WebpackPluginInstance {
  private usageTracker: Map<Feature, FeatureUsage> = new Map<
    Feature,
    FeatureUsage
  >()

  // Build feature usage is on/off and is known before the build starts
  constructor(buildFeaturesMap: Map<Feature, boolean>) {
    for (const featureName of BUILD_FEATURES) {
      this.usageTracker.set(featureName, {
        featureName,
        invocationCount: buildFeaturesMap.get(featureName) ? 1 : 0,
      })
    }

    for (const featureName of FEATURE_MODULE_MAP.keys()) {
      this.usageTracker.set(featureName, {
        featureName,
        invocationCount: 0,
      })
    }

    for (const featureName of FEATURE_MODULE_REGEXP_MAP.keys()) {
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
              const originModules = findUniqueOriginModulesInConnections(
                connections,
                module
              )
              this.usageTracker.get(feature)!.invocationCount =
                originModules.size
            }
            modulesFinish()
          }
        )
        callback()
      }
    )
    if (compiler.options.mode === 'production' && !compiler.watchMode) {
      compiler.hooks.compilation.tap(TelemetryPlugin.name, (compilation) => {
        const moduleHooks = NormalModule.getCompilationHooks(compilation)
        moduleHooks.loader.tap(TelemetryPlugin.name, (loaderContext: any) => {
          loaderContext.eliminatedPackages = eliminatedPackages
        })
      })
    }
  }

  usages(): FeatureUsage[] {
    return [...this.usageTracker.values()]
  }

  packagesUsedInServerSideProps(): string[] {
    return Array.from(eliminatedPackages)
  }
}

export type TelemetryPluginState = {
  usages: ReturnType<TelemetryPlugin['usages']>
  packagesUsedInServerSideProps: ReturnType<
    TelemetryPlugin['packagesUsedInServerSideProps']
  >
}
