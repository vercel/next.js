import type {
  ProxyConfig,
  ProxyMatcher,
  RSCModuleType,
} from '../analysis/get-page-static-info'
import type { CustomRoutes, Rewrite } from '../../lib/load-custom-routes'
import type { BuildManifest } from '../../server/get-page-files'

export type PagesManifest = { [page: string]: string }

export interface EdgeFunctionDefinition {
  files: string[]
  name: string
  page: string
  entrypoint: string
  matchers: ProxyMatcher[]
  env: Record<string, string>
  wasm?: AssetBinding[]
  assets?: AssetBinding[]
  regions?: string[] | string
}

export interface MiddlewareManifest {
  version: 3
  sortedMiddleware: string[]
  middleware: { [page: string]: EdgeFunctionDefinition }
  functions: { [page: string]: EdgeFunctionDefinition }
}

export const SUPPORTED_NATIVE_MODULES = [
  'buffer',
  'events',
  'assert',
  'util',
  'async_hooks',
] as const

export interface EdgeMiddlewareMeta {
  page: string
  matchers?: ProxyMatcher[]
}

export interface EdgeSSRMeta {
  isServerComponent: boolean
  isAppDir?: boolean
  page: string
}

export interface AssetBinding {
  filePath: string
  name: string
}

export interface ServerActionLocation {
  line: number
  col: number
}

export interface ServerActionInfo {
  name: string
  loc?: ServerActionLocation
}

export interface RSCMeta {
  type: RSCModuleType
  actionIds?: Record<string, string | ServerActionInfo>
  clientRefs?: string[]
  clientEntryType?: 'cjs' | 'auto'
  isClientRef?: boolean
  requests?: string[]
}

export interface RouteMeta {
  page: string
  absolutePagePath: string
  preferredRegion: string | string[] | undefined
  middlewareConfig: ProxyConfig
  relatedModules?: string[]
}

export type ModuleId = string | number
export type ManifestChunks = ReadonlyArray<string>

export interface ManifestNode {
  [moduleExport: string]: {
    id: ModuleId
    name: string
    chunks: ManifestChunks
    async?: boolean
  }
}

export interface ClientReferenceManifestForRsc {
  clientModules: ManifestNode
  rscModuleMapping: {
    [moduleId: string]: ManifestNode
  }
  edgeRscModuleMapping: {
    [moduleId: string]: ManifestNode
  }
}

export type CssResource = InlinedCssFile | UninlinedCssFile

interface InlinedCssFile {
  path: string
  inlined: true
  content: string
}

interface UninlinedCssFile {
  path: string
  inlined: false
}

export interface ClientReferenceManifest extends ClientReferenceManifestForRsc {
  readonly moduleLoading: {
    prefix: string
    crossOrigin?: 'use-credentials' | ''
  }
  ssrModuleMapping: {
    [moduleId: string]: ManifestNode
  }
  edgeSSRModuleMapping: {
    [moduleId: string]: ManifestNode
  }
  entryCSSFiles: {
    [entry: string]: CssResource[]
  }
  entryJSFiles?: {
    [entry: string]: string[]
  }
}

type Actions = {
  [actionId: string]: {
    exportedName?: string
    filename?: string
    workers: {
      [name: string]: {
        moduleId: string | number
        async: boolean
      }
    }
    layer?: {
      [name: string]: string
    }
  }
}

export type ActionManifest = {
  encryptionKey: string
  node: Actions
  edge: Actions
}

export interface ModuleInfo {
  moduleId: string | number
  async: boolean
}

export type NextFontManifest = {
  pages: {
    [path: string]: string[]
  }
  app: {
    [entry: string]: string[]
  }
  appUsingSizeAdjust: boolean
  pagesUsingSizeAdjust: boolean
}

export type SubresourceIntegrityAlgorithm = 'sha256' | 'sha384' | 'sha512'

export type ModuleGetter = () => any
export type ModuleTuple = [getModule: ModuleGetter, filePath: string]

export type CollectedMetadata = {
  icon: ModuleGetter[]
  apple: ModuleGetter[]
  twitter: ModuleGetter[] | null
  openGraph: ModuleGetter[] | null
  manifest?: string
}

export type MetadataImageModule = {
  url: string
  type?: string
  alt?: string
} & (
  | { sizes?: string }
  | {
      width?: number
      height?: number
    }
)

type AppDirFileType =
  | 'layout'
  | 'template'
  | 'error'
  | 'loading'
  | 'global-error'
  | 'global-not-found'
  | 'not-found'
  | 'forbidden'
  | 'unauthorized'

export type AppDirModules = {
  readonly [moduleKey in AppDirFileType]?: ModuleTuple
} & {
  readonly page?: ModuleTuple
} & {
  readonly metadata?: CollectedMetadata
} & {
  readonly defaultPage?: ModuleTuple
}

export type ClientBuildManifest = {
  [key: string]: string[]
}

export const srcEmptySsgManifest = `self.__SSG_MANIFEST=new Set;self.__SSG_MANIFEST_CB&&self.__SSG_MANIFEST_CB()`

function normalizeRewrite(item: {
  source: string
  destination: string
  has?: any
}): CustomRoutes['rewrites']['beforeFiles'][0] {
  return {
    has: item.has,
    source: item.source,
    destination: item.destination,
  }
}

export const processRoute = (r: Rewrite) => {
  const rewrite = { ...r }

  if (!rewrite?.destination?.startsWith('/')) {
    delete (rewrite as any).destination
  }
  return rewrite
}

export function normalizeRewritesForBuildManifest(
  rewrites: CustomRoutes['rewrites']
): CustomRoutes['rewrites'] {
  return {
    afterFiles: rewrites.afterFiles
      ?.map(processRoute)
      ?.map((item) => normalizeRewrite(item)),
    beforeFiles: rewrites.beforeFiles
      ?.map(processRoute)
      ?.map((item) => normalizeRewrite(item)),
    fallback: rewrites.fallback
      ?.map(processRoute)
      ?.map((item) => normalizeRewrite(item)),
  }
}

export function createEdgeRuntimeManifest(
  assetMap: Partial<BuildManifest>
): string {
  return `globalThis.__BUILD_MANIFEST = ${JSON.stringify(assetMap, null, 2)};\n`
}

export type UseCacheTrackerKey = `useCache/${string}`

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

export type TelemetryFeature =
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
  | 'skipProxyUrlNormalize'
  | 'skipTrailingSlashRedirect'
  | 'modularizeImports'
  | 'esmExternals'
  | 'webpackPlugins'
  | UseCacheTrackerKey

export interface TelemetryPlugin {
  usages(): Array<{ featureName: TelemetryFeature; invocationCount: number }>
  packagesUsedInServerSideProps(): string[]
  getUseCacheTracker(): Record<UseCacheTrackerKey, number>
}

export type TelemetryPluginState = {
  usages: ReturnType<TelemetryPlugin['usages']>
  packagesUsedInServerSideProps: ReturnType<
    TelemetryPlugin['packagesUsedInServerSideProps']
  >
  useCacheTracker: ReturnType<TelemetryPlugin['getUseCacheTracker']>
}

export interface TurbotraceAction {
  action: 'print' | 'annotate'
  input: string[]
  contextDirectory: string
  processCwd: string
  showAll?: boolean
  memoryLimit?: number
}

export interface BuildTraceContext {
  entriesTrace?: {
    action: TurbotraceAction
    appDir: string
    outputPath: string
    depModArray: string[]
    entryNameMap: Record<string, string>
    absolutePathByEntryName: Record<string, string>
  }
  chunksTrace?: {
    action: TurbotraceAction
    outputPath: string
    entryNameFilesMap: Record<string, Array<string>>
  }
}
