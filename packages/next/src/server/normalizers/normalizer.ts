export interface Normalizer<
  Input extends string = string,
  Output extends string = Input,
> {
  normalize(pathname: Input): Output
}
