import type {
  CustomCoverageRequest,
  CustomCoverageCompletion,
} from './coverage/custom-types'
import type { TestTagDefinition } from './runner/tasks'
import type {
  ResultEvent,
  FileResult,
  SerializedDiagnostic,
} from './reporting/events'
import type {
  CoverageArtifactMetadata,
  MockCoverageSources,
  CoverageCapture,
} from './coverage/types'
import type { WorkStoreContext } from '../../server/async-storage/work-store'
import type { NextConfigComplete } from '../../server/config-shared'
import type { SnapshotUpdate, SnapshotUpdateMode } from './assertions/snapshots'

/** Requested Next compilation context, not a replacement compiler configuration. */
export interface TestProfile {
  id: string
  mode: 'development' | 'production'
  environment: 'node' | 'rsc' | 'browser'
  runtime: 'nodejs'
  bundler: 'turbopack'
  route?: string
  /** Explicit actual-client Browser Mode; ordinary browser drivers omit this. */
  browserClient?: true
}

/** Process execution realm; does not alter the Next compiler condition set. */
export interface TestExecutionEnvironment {
  name: string
  options?: Record<string, unknown>
}

export interface TestEntry {
  /** Current-file import.meta.vitest marker requires native substitution. */
  inSource?: true
  /** Exact raw source bytes from marker discovery. */
  inSourceHash?: string
  executionEnvironment?: TestExecutionEnvironment
  /** Binds the discovered file pragmas to the compiler's exact source bytes. */
  environmentSourceHash?: string
  /** Collected and checked by TypeScript, never evaluated as a runtime entry. */
  typecheck?: true
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
export interface CompiledSourceDependencies {
  version: 1
  kind: 'native-module-sources'
  complete: boolean
  entry: { file: string; sha256: string }
  files: { file: string; sha256: string }[]
}

export interface CompileTestOptions {
  /** Compile-only planner request; never a runtime execution option. */
  dependencyPlan?: boolean
  setupFilesSequence?: 'list' | 'parallel'
  signal: AbortSignal
  coverage?: TestCoverageRequest
  /** Absolute, project-contained filenames in declared execution order. */
  snapshotSerializers?: readonly string[]
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
  /** Exact entry source bytes observed when this immutable revision was emitted. */
  sourceHash?: string
  rootDir: string
  /** Emitted entry path relative to rootDir. */
  entryPath: string
  files: string[]
  diagnostics: SerializedDiagnostic[]
  /** Exact ordered compiler inputs. Absent means legacy no-setup compilation. */
  snapshotSerializers?: readonly string[]
  setupFiles?: readonly string[]
  /** Compiler-issued graph bridge; never inferred from a user execution option. */
  moduleMocking?: {
    version: 1
    coverage?: MockCoverageSources & {
      nativeMetadata: { path: string; sha256: string }
    }
  }
  /** Explicit compile-only native source and resolver dependency evidence. */
  sourceDependencies?: CompiledSourceDependencies
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

/** Facts emitted from the actual selected AppProject loader tree. */
export interface CompiledTestRoute {
  version: 1
  pathname: string
  page: string
  runtime: 'nodejs'
  basePath: string
  rootParamNames: string[]
  config: {
    dynamic: 'auto' | 'force-dynamic' | 'force-static' | 'error'
    dynamicParams: boolean
    revalidate: false | number | 'force-cache'
    fetchCache:
      | 'auto'
      | 'default-cache'
      | 'only-cache'
      | 'force-cache'
      | 'default-no-store'
      | 'only-no-store'
      | 'force-no-store'
  }
  entry: { file: string; sha256: string }
  sources: { file: string; sha256: string }[]
}

export interface CompiledRscTestArtifact
  extends CompiledTestArtifactBase<'rsc'> {
  kind: 'rsc'
  /** Native sidecar retained in the immutable output closure. */
  route?: CompiledTestRoute & { metadataPath: string }
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

/** Ordered compiler-owned roots sharing one module graph and immutable emission. */
export interface CompiledTestCohortIdentity {
  version: 1
  /** Numeric dispatch into the compiler-created entry; never a runtime path. */
  index: number
  /** Native order evidence, present in the immutable artifact files. */
  metadataPath: string
  /** Exact bytes of every emitted file, including shared helper chunks and maps. */
  outputs: readonly { path: string; sha256: string }[]
  entries: readonly {
    entryId: string
    /** Normalized project-relative source path. */
    file: string
    sourceHash: string
  }[]
}

export interface CompiledTestCohort {
  version: 1
  artifacts: readonly CompiledNodeTestArtifact[]
}

/** Node units and Node browser-e2e drivers have no RSC manifests or request state. */
export interface CompiledNodeTestArtifact
  extends CompiledTestArtifactBase<'node' | 'browser'> {
  kind: 'node'
  /** Native-issued actual module-ID manifest, never a public reset option. */
  moduleCache?: { version: 1 }
  /** Native-issued dynamic target IDs and entry ownership, separate from static mocks. */
  dynamicModuleMocking?: { version: 1 }
  /** Present only for a compiler-created shared Node worker cohort. */
  cohort?: CompiledTestCohortIdentity
  /** Browser drivers only: resolved evidence required before app-server startup. */
  applicationServer?: {
    mode: TestProfile['mode']
    lockDistDir: boolean
    /** Resolved absolute application output directory; required for production. */
    distDir?: string
  }
}

/** A real client graph; the entry path is its native descriptor, never Node code. */
export interface CompiledBrowserClientTestArtifact
  extends CompiledTestArtifactBase<'browser'> {
  sourceHash: string
  kind: 'browser'
  client: {
    version: 1
    /** Canonical selected source bound to the native sidecar's raw SHA256. */
    sourceFile: string
    scripts: readonly string[]
    styles: readonly string[]
    /** Exact SHA256 of every emitted regular file, including scripts and maps. */
    outputs: readonly { path: string; sha256: string }[]
  }
}

/** A retains this complete immutable closure until the execution process closes. */
export type CompiledTestArtifact =
  | CompiledRscTestArtifact
  | CompiledNodeTestArtifact
  | CompiledBrowserClientTestArtifact

export interface CollectedTestCase {
  id: string
  name: string
}

/** Collection facts have no execution outcome or invented source location. */
export interface TestFileCollection {
  version: 1
  entryId: string
  revision: string
  cases: CollectedTestCase[]
}

export type TestExecutionResult = FileResult & {
  /** Available only after successful collection and authoritative cleanup. */
  collection?: TestFileCollection
}

export interface ExecuteTestOptions {
  /** Address for an explicitly requested inspector on this file worker. */
  inspect?: string
  collectOnly?: boolean
  runId: string
  coverage?: TestCoverageRequest
  /** Parent-only callback, awaited after authoritative worker exit and cleanup. */
  onCoverage?: (completion: TestCoverageCompletion) => Promise<void>
  customCoverage?: CustomCoverageRequest
  /** Parent-only opaque payload consumer after authoritative worker cleanup. */
  onCustomCoverage?: (completion: CustomCoverageCompletion) => Promise<void>
  /** Actual configured application directory; never the artifact directory. */
  projectDir: string
  entry: TestEntry
  snapshotSerializers?: string[]
  setupFiles: string[]
  /** Legacy explicit-all request. A mode, when supplied, owns this run's policy. */
  updateSnapshots?: boolean
  snapshotUpdateMode?: SnapshotUpdateMode
  /** Parent-only staging callback; the outer resource owner authorizes commit. */
  onSnapshotUpdates?: (file: string, updates: SnapshotUpdate[]) => Promise<void>
  testNamePattern?: string | RegExp
  tags?: readonly TestTagDefinition[]
  strictTags?: boolean
  attachmentsDir?: string
  globals?: boolean
  fakeTimers?: import('./assertions/utilities').FakeTimerOptions
  clearMocks?: boolean
  mockReset?: boolean
  restoreMocks?: boolean
  unstubGlobals?: boolean
  unstubEnvs?: boolean
  maxConcurrency?: number
  retry?: import('./runner/collector').TestOptions['retry']
  bail?: number
  allowOnly?: boolean
  passWithNoTests?: boolean
  sequence?: import('./runner/sequence').TestSequenceOptions
  provide?: Record<string, unknown>
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
) => Promise<TestExecutionResult>

/** One parent-owned process executes the compiler-issued ordered cohort. */
export type ExecuteTestCohort = (
  cohort: CompiledTestCohort,
  options: readonly ExecuteTestOptions[]
) => Promise<readonly TestExecutionResult[]>
