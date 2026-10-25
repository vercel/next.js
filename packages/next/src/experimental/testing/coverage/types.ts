/** Exact native generated-source identities; hashes bind decoded sourcesContent. */
export interface MockCoverageSources {
  version: 1
  sources: readonly { source: string; sha256: string }[]
}

/** Internal, versioned data only. Coverage never supplies a compiler or runtime. */
export interface CoverageArtifactMetadata {
  version: 1
  /** Explicit native test producer proof; never a public configuration value. */
  importRoles?: { version: 1; nativeMetadata: { path: string; sha256: string } }
  /** Compile-only entry; never executable runtime coverage evidence. */
  sourceAnalysis?: { version: 1; file: string; sha256: string }
  syntheticSources?: Record<string, { sha256: string }>
  /** Production runtime with native source denominators retained for real V8 counts. */
  sourcePreservation?: {
    version: 1
    nativeMetadata: { path: string; sha256: string }
  }
  /** Native concrete output roles, independently negotiated before compilation. */
  browser?: {
    nativeMetadata: { path: string; sha256: string }
    generatedScripts: Record<
      string,
      { sha256: string; role: 'native-ecmascript-bookkeeping' }
    >
  } & (
    | {
        version: 1
        /** Fresh actual dev import sections remain in this Native certificate. */
        developmentImports?: { version: 1; mode: 'development' }
      }
    | {
        version: 2
        mode: 'production'
        sourceMaps: 'absolute-file-uri'
        preserveOriginalSyntax: true
        /** Actual native generated import sections remain in the bound certificate. */
        importInitializers?: { version: 1 }
      }
  )
  scripts: {
    path: string
    sha256: string
    mapPath?: string
    mapSha256?: string
  }[]
  /** Exact map identities; null means an explicitly excluded source. */
  sources: Record<string, { file: string; sha256: string } | null>
}

export interface CoverageRange {
  startOffset: number
  endOffset: number
  count: number
}

export interface CoverageCapture {
  version: 1
  kind?: 'browser-cdp'
  scripts: {
    path: string
    sha256: string
    functions: { ranges: CoverageRange[]; isBlockCoverage: boolean }[]
  }[]
}

export interface SourceLineCoverage {
  /** Canonical absolute original source identity. */
  file: string
  sha256: string
  /** One-based mapped original lines; no unimported-file expansion. */
  executableLines: number[]
  coveredLines: number[]
}

export interface FileCoverage {
  version: 1
  entryId: string
  revision: string
  complete: boolean
  errors: string[]
  files: SourceLineCoverage[]
}

export interface CoverageReport {
  version: 1
  kind: 'node-line'
  complete: boolean
  errors: string[]
  entries: string[]
  files: SourceLineCoverage[]
  totals: { executable: number; covered: number; percent: number | null }
}

/** Standard maps are derived from actual V8 ranges, never estimated line hits. */
export interface StandardCoverageLocation {
  start: { line: number; column: number }
  end: { line: number; column: number }
}
export interface StandardCoverageData {
  path: string
  statementMap: Record<string, StandardCoverageLocation>
  fnMap: Record<
    string,
    {
      name: string
      decl: StandardCoverageLocation
      loc: StandardCoverageLocation
      line: number
    }
  >
  branchMap: Record<
    string,
    {
      type: string
      loc: StandardCoverageLocation
      locations: {
        start: Partial<StandardCoverageLocation['start']>
        end: Partial<StandardCoverageLocation['end']>
      }[]
      line: number
    }
  >
  s: Record<string, number>
  f: Record<string, number>
  b: Record<string, number[]>
  meta?: {
    lastBranch: number
    lastFunction: number
    lastStatement: number
    seen: Record<string, number>
    fnNames: Map<string, number> | Record<string, number>
  }
}
export interface StandardFileCoverage {
  version: 1
  entryId: string
  revision: string
  complete: boolean
  errors: string[]
  files: { file: string; sha256: string; data: StandardCoverageData }[]
}

export type StandardCoverageMetric =
  | 'statements'
  | 'functions'
  | 'branches'
  | 'lines'
export interface StandardCoverageOptions {
  reporter: (
    | 'json'
    | 'json-summary'
    | 'text-summary'
    | 'lcov'
    | 'lcovonly'
    | 'text'
    | 'html'
    | 'clover'
    | 'cobertura'
    | 'html-spa'
    | 'teamcity'
    | 'text-lcov'
    | 'none'
  )[]
  /** Configured providers use the pinned formatter's complete report contracts. */
  formatterReports?: true
  reporterOptions?: { text?: { skipFull?: boolean } }
  /** Undefined retains the existing CLI report-publication behavior. */
  clean?: boolean
  include?: string[]
  exclude: string[]
  reportsDirectory: string
  reportOnFailure: boolean
  /** Watch generations replace prior facts by default. */
  cleanOnRerun?: boolean
  thresholds: Partial<Record<StandardCoverageMetric, number>> & {
    100?: boolean
    perFile?: boolean
    /** One-shot callers update their selected configuration after publication. */
    autoUpdate?: boolean
  }
  /** Configured patterns retain their own units, per-file mode and order. */
  thresholdGroups?: {
    pattern: string
    thresholds: StandardCoverageOptions['thresholds']
  }[]
}

/** Improvements derived from the actual published coverage map. */
export interface StandardCoverageThresholdUpdate {
  pattern?: string
  metric: StandardCoverageMetric
  previous: number
  value: number
}

export interface ProjectStandardCoverageConfig {
  enabled: boolean
  options: StandardCoverageOptions
}

/** The native compiler emits this entry but no runtime may evaluate it. */
export interface CompiledCoverageSource {
  version: 1
  kind: 'next-compiler-source'
  source: { file: string; sha256: string }
  artifact: import('../contracts').CompiledTestArtifact
  /** Actual ordinary Next module-load graph, bound to this source artifact. */
  configurationImports?: import('../compiler/config-import-proof').ConfigurationImportProof
}

/** Parent-derived declaration-only metadata, separate from observed runtime facts. */
export interface CompilerSourceCoverage {
  version: 1
  kind: 'next-compiler-declarations'
  source: { file: string; sha256: string }
  profile: import('../contracts').TestProfile
  compiler: {
    entryId: string
    revision: string
    configurationImports?: {
      request: import('../compiler/config-import-proof').ConfigurationImportAuthorization
      graph: import('../compiler/config-imports').ConfigurationImportFiles
    }
  }
  data: StandardCoverageData
}
