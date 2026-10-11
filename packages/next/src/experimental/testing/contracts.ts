import type {
  ResultEvent,
  FileResult,
  SerializedDiagnostic,
} from './reporting/events'
import type {
  CoverageArtifactMetadata,
  CoverageCapture,
} from './coverage/types'
import type { WorkStoreContext } from '../../server/async-storage/work-store'
import type { NextConfigComplete } from '../../server/config-shared'

/** Requested Next compilation context, not a replacement compiler configuration. */
export interface TestProfile {
  id: string
  mode: 'development' | 'production'
  environment: 'node' | 'rsc' | 'browser'
  runtime: 'nodejs'
  bundler: 'turbopack'
  route?: string
}

export interface TestEntry {
  /** Stable identity combining project/profile name and project-relative path. */
  id: string
  /** Absolute source filename. */
  file: string
  profile: TestProfile
}

/** The first coverage protocol is opt-in and deliberately narrower than profiles. */
export interface TestCoverageRequest {
  version: 1
  kind: 'node-line'
}

export type TestCoverageCompletion = {
  version: 1
  runId: string
  entryId: string
  revision: string
} & (
  | { complete: true; data: CoverageCapture }
  | { complete: false; error: SerializedDiagnostic }
)

/** Explicit source registration, never an arbitrary browser-supplied module path. */
export interface RegisteredBrowserFixture {
  id: string
  /** Absolute, real, project-contained source file after discovery. */
  module: string
  exportName: string
}

/** Private host registration, passed only to the owned development app compiler. */
export interface BrowserFixtureHost {
  routePrefix: string
  fixtures: readonly RegisteredBrowserFixture[]
}

/** Compiler inputs; setup order is part of the immutable entry identity. */
export interface CompileTestOptions {
  signal: AbortSignal
  coverage?: TestCoverageRequest
  /** Absolute, project-contained filenames in declared execution order. */
  setupFiles?: readonly string[]
}

/** Allocated before emission so an outer watch owner can reclaim crash leftovers. */
export interface TestCompilerSessionOptions {
  /** Caller retains deletion ownership through every worker and compiler shutdown. */
  allocateArtifact?: (parentDir: string) => Promise<{
    stagingDir: string
    rootDir: string
  }>
}

/** Serializable options for the runtime-owned incremental cache constructor. */
export interface CompiledTestIncrementalCacheConfig {
  cacheMaxMemorySize: NextConfigComplete['cacheMaxMemorySize']
  allowedRevalidateHeaderKeys: NextConfigComplete['experimental']['allowedRevalidateHeaderKeys']
  fetchCacheKeyPrefix: NextConfigComplete['experimental']['fetchCacheKeyPrefix']
  isrFlushToDisk: boolean
  /** Based on configured handler values, not the presence of the default object. */
  customHandlersConfigured: boolean
}

/**
 * Serializable metadata from the compiler's resolved Next configuration.
 * Request inputs, route-derived modes, lifecycle callbacks, and cache instances
 * remain owned by the emitted runtime; this is not a complete WorkStoreContext.
 */
export interface CompiledTestRequestContext {
  /** Actual resolved compiler mode, also used by request/cache runtime setup. */
  mode: TestProfile['mode']
  buildId: WorkStoreContext['buildId']
  deploymentId: WorkStoreContext['deploymentId']
  /** Request/cache execution must reject absent metadata or unsupported handlers. */
  incrementalCache?: CompiledTestIncrementalCacheConfig
  renderOpts: Pick<
    WorkStoreContext['renderOpts'],
    | 'cacheLifeProfiles'
    | 'staticPageGenerationTimeout'
    | 'cacheComponents'
    | 'validationLevel'
    | 'assetPrefix'
  > & {
    experimental: Pick<
      WorkStoreContext['renderOpts']['experimental'],
      'authInterrupts' | 'useCacheTimeout' | 'durableUseCacheEntries'
    >
  }
}

/** Common immutable closure; v1 artifacts are deliberately not accepted by v2 hosts. */
interface CompiledTestArtifactBase<
  Environment extends TestProfile['environment'],
> {
  version: 2
  /** Exact emitted script/map identities, produced only on explicit request. */
  coverage?: CoverageArtifactMetadata
  entryId: string
  profile: TestProfile & { environment: Environment }
  revision: string
  rootDir: string
  /** Emitted entry path relative to rootDir. */
  entryPath: string
  files: string[]
  diagnostics: SerializedDiagnostic[]
  /** Exact ordered compiler inputs. Absent means legacy no-setup compilation. */
  setupFiles?: readonly string[]
  /** Compiler-issued graph bridge; never inferred from a user execution option. */
  moduleMocking?: { version: 1 }
  /** Actual native server emission hashes, not a complete source dependency graph. */
  dependencyEvidence?: {
    kind: 'emitted-output'
    complete: false
    serverOutputs: readonly {
      /** Relative to rootDir, also present in artifact.files. */
      path: string
      contentHash: string
    }[]
  }
}

export interface CompiledRscTestArtifact
  extends CompiledTestArtifactBase<'rsc'> {
  kind: 'rsc'
  manifestPage: string
  /** Manifest paths relative to the immutable rootDir. Never embed preview keys. */
  manifests: {
    clientReference: string
    serverActions: string
    /** Both additional manifests are required for request/cache execution. */
    previewProps?: string
    prerender?: string
  }
  /** Request rendering must reject absent metadata, never fabricate defaults. */
  requestContext?: CompiledTestRequestContext
}

/** Node units and Node browser-e2e drivers have no RSC manifests or request state. */
export interface CompiledNodeTestArtifact
  extends CompiledTestArtifactBase<'node' | 'browser'> {
  kind: 'node'
  /** Browser drivers only: resolved evidence required before app-server startup. */
  applicationServer?: {
    mode: TestProfile['mode']
    lockDistDir: boolean
    /** Resolved absolute application output directory; required for production. */
    distDir?: string
  }
}

/** A retains this complete immutable closure until the execution process closes. */
export type CompiledTestArtifact =
  | CompiledRscTestArtifact
  | CompiledNodeTestArtifact

export interface ExecuteTestOptions {
  runId: string
  coverage?: TestCoverageRequest
  /** Parent-only callback, awaited after authoritative worker exit and cleanup. */
  onCoverage?: (completion: TestCoverageCompletion) => Promise<void>
  /** Actual configured application directory; never the artifact directory. */
  projectDir: string
  entry: TestEntry
  setupFiles: string[]
  /** Explicit update for this run only. Omitted/false must never write snapshots. */
  updateSnapshots?: boolean
  testNamePattern?: string
  testTimeout: number
  hookTimeout: number
  /** Outer process deadline, independent of the case/hook timeout. */
  fileTimeout: number
  signal: AbortSignal
  onEvent(event: ResultEvent): void
  browser?: {
    wsEndpoint: string
    baseURL: string
    /** Absolute parent-retained attachment root; B allocates safe attempt subdirs. */
    outputDir: string
    componentHost?: { routePrefix: string; fixtureIds: readonly string[] }
  }
}

/** B owns fresh processes and returns only after the file process has closed. */
export type ExecuteTest = (
  artifact: CompiledTestArtifact,
  options: ExecuteTestOptions
) => Promise<FileResult>
