import type { TestProfile } from '../contracts'
import type { CompilerTransformDescriptor } from '../compiler/transform-broker'
import type { CompilerTransformSourceMap } from '../compiler/transform-hooks'
import type { StandardCoverageLocation } from './types'

type Position = StandardCoverageLocation['start']

/** Actual instrumenter output before the provider's source-map remapping. */
export interface IstanbulRawFileCoverage {
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
      locations: { start: Partial<Position>; end: Partial<Position> }[]
      line: number
    }
  >
  s: Record<string, number>
  f: Record<string, number>
  b: Record<string, number[]>
  inputSourceMap?: CompilerTransformSourceMap
  _coverageSchema?: string
  hash?: string
}

/** A separate selection from native TypeScript declaration-analysis roles. */
export interface IstanbulSourcePlan {
  version: 1
  /** Default discovery captures actual evaluated sources, without eager zeros. */
  importedOnly?: true
  profile: TestProfile
  sources: { file: string; sha256: string }[]
}

export interface IstanbulInstrumentationMetadata {
  version: 1
  importedOnly?: true
  sources: {
    file: string
    sha256: string
    initial: IstanbulRawFileCoverage
  }[]
}

/** Parent-owned ordinary loader transport; never a user transform permission. */
export interface IstanbulInstrumentationDescriptor {
  version: 1
  transport: CompilerTransformDescriptor
  profile: TestProfile
  metadata: IstanbulInstrumentationMetadata
}

export interface IstanbulCoverageCapture {
  version: 1
  kind: 'node-istanbul'
  files: Record<string, IstanbulRawFileCoverage>
}

/** Real remapper output omits line fields; legacy V8 maps keep requiring them. */
export interface IstanbulMappedFileCoverage {
  path: string
  statementMap: IstanbulRawFileCoverage['statementMap']
  fnMap: Record<
    string,
    Omit<IstanbulRawFileCoverage['fnMap'][string], 'line'> & { line?: number }
  >
  branchMap: Record<
    string,
    Omit<IstanbulRawFileCoverage['branchMap'][string], 'line'> & {
      line?: number
    }
  >
  s: IstanbulRawFileCoverage['s']
  f: IstanbulRawFileCoverage['f']
  b: IstanbulRawFileCoverage['b']
}

export interface IstanbulStandardFileCoverage {
  version: 1
  provider: 'istanbul'
  entryId: string
  revision: string
  complete: boolean
  errors: string[]
  files: { file: string; sha256: string; data: IstanbulMappedFileCoverage }[]
}
