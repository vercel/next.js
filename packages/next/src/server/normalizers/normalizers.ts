import type { Normalizer } from './normalizer'

/**
 * Normalizers combines many normalizers into a single normalizer interface that
 * will normalize the inputted pathname with each normalizer in order.
 */
export class Normalizers implements Normalizer {
  constructor(private readonly normalizers: Array<Normalizer> = []) {}

  public push(normalizer: Normalizer) {
    this.normalizers.push(normalizer)
  }

  public normalize(pathname: string): string {
    return this.normalizers.reduce<string>(
      (normalized, normalizer) => normalizer.normalize(normalized),
      pathname
    )
  }
}
