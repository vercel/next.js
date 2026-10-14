import type { Normalizer } from './normalizer'

export function wrapNormalizerFn<Input extends string, Output extends string>(
  fn: (pathname: Input) => Output
): Normalizer<Input, Output> {
  return { normalize: fn }
}
