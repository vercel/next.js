/** Internal, versioned data only. Coverage never supplies a compiler or runtime. */
export interface CoverageArtifactMetadata {
  version: 1
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
