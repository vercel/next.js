export interface Normalizer<T = string> {
  normalize(input: T): T
}
