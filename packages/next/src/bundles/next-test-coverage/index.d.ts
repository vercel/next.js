export interface CoverageData {
  path: string
  statementMap: Record<string, Location>
  fnMap: Record<
    string,
    { name: string; decl: Location; loc: Location; line: number }
  >
  branchMap: Record<
    string,
    {
      type: string
      loc: Location
      locations: {
        start: Partial<Location['start']>
        end: Partial<Location['end']>
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
interface Location {
  start: { line: number; column: number }
  end: { line: number; column: number }
}
export function convert(options: {
  code: string
  sourceMap: object
  ast: unknown
  coverage: {
    url: string
    functions: {
      isBlockCoverage: boolean
      ranges: { startOffset: number; endOffset: number; count: number }[]
    }[]
  }
}): Promise<Record<string, CoverageData>>

/** Pinned formatter primitives only; all inputs are supplied by the Next owner. */
export function writeReports(
  data: Record<
    string,
    | CoverageData
    | import('../../experimental/testing/coverage/istanbul-types').IstanbulMappedFileCoverage
  >,
  directory: string,
  reporters: string[],
  options?: Record<string, object>
): Promise<string>
