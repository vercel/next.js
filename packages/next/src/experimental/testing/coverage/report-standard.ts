import type { IstanbulMappedFileCoverage } from './istanbul-types'
import type { StandardCoverageData } from './types'

export type PreparedCoverageMap = Readonly<
  Record<string, StandardCoverageData | IstanbulMappedFileCoverage>
>
