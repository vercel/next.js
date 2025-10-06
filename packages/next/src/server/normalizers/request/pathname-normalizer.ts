import type { Normalizer } from '../normalizer'

export interface PathnameNormalizer extends Normalizer {
  match(pathname: string): boolean
  normalize(pathname: string, matched?: boolean): string
}
