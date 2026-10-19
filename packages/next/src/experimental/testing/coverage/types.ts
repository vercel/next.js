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
    version: 1
    nativeMetadata: { path: string; sha256: string }
    generatedScripts: Record<
      string,
      { sha256: string; role: 'native-ecmascript-bookkeeping' }
    >
  }
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
  reporter: ('json' | 'lcov')[]
  include?: string[]
  exclude: string[]
  reportsDirectory: string
  reportOnFailure: boolean
  /** Watch generations replace prior facts by default. */
  cleanOnRerun?: boolean
  thresholds: Partial<Record<StandardCoverageMetric, number>>
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
