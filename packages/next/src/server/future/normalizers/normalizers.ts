import { Normalizer } from './normalizer'

/**
 * Normalizers combines many normalizers into a single normalizer interface that
 * will normalize the inputted pathname with each normalizer in order.
 */
export class Normalizers implements Normalizer {
  public constructor(private readonly normalizers: Array<Normalizer> = []) {}

  public push(normalizer: Normalizer): void {
    this.normalizers.push(normalizer)
  }

  public normalize(pathname: string): string {
    return this.normalizers.reduce<string>(
      (normalized, normalizer) => normalizer.normalize(normalized),
      pathname
    )
  }
}
