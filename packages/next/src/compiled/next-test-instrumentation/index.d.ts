import type {
  IstanbulRawFileCoverage,
  IstanbulMappedFileCoverage,
} from '../../experimental/testing/coverage/istanbul-types'
import type { CompilerTransformSourceMap } from '../../experimental/testing/compiler/transform-hooks'

export function instrumentJavaScript(
  source: string,
  file: string
): {
  code: string
  map: CompilerTransformSourceMap
  initial: IstanbulRawFileCoverage
}
export function remapIstanbulCoverage(
  data: Record<string, IstanbulRawFileCoverage>
): Promise<Record<string, IstanbulMappedFileCoverage>>
export function mergeIstanbulCoverage(
  maps: readonly Record<string, IstanbulMappedFileCoverage>[]
): Record<string, IstanbulMappedFileCoverage>
