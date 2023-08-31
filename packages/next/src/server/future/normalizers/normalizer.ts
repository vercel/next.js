export interface Normalizer<Input = string> {
  normalize(input: Input): Input
}
