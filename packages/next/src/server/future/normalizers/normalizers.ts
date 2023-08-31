import { Normalizer } from './normalizer'

/**
 * Normalizers combines many normalizers into a single normalizer interface that
 * will normalize the inputted pathname with each normalizer in order.
 */
export class Normalizers<Input = string> implements Normalizer<Input> {
  constructor(private readonly normalizers: Array<Normalizer<Input>> = []) {}

  public push(normalizer: Normalizer<Input>) {
    this.normalizers.push(normalizer)
  }

  public normalize(input: Input): Input {
    return this.normalizers.reduce<Input>(
      (normalized, normalizer) => normalizer.normalize(normalized),
      input
    )
  }
}
