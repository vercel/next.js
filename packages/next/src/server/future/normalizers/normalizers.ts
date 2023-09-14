import { Normalizer } from './normalizer'

/**
 * Normalizers combines many normalizers into a single normalizer interface that
 * will normalize the inputted pathname with each normalizer in order.
 */
export class Normalizers<T = string> implements Normalizer<T> {
  constructor(private readonly normalizers: Array<Normalizer<T>> = []) {}

  public push(normalizer: Normalizer<T>) {
    this.normalizers.push(normalizer)
  }

  public normalize(input: T): T {
    return this.normalizers.reduce<T>(
      (normalized, normalizer) => normalizer.normalize(normalized),
      input
    )
  }
}
