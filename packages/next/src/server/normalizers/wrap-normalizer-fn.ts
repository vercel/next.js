import type { Normalizer } from './normalizer'

export function wrapNormalizerFn(fn: (pathname: string) => string): Normalizer {
  return { normalize: fn }
}
