export type Awaitable<T> = T | PromiseLike<T>
export type Nullable<T> = T | null | undefined
export type Arrayable<T> = T | Array<T>
export type ArgumentsType<T> = T extends (...args: infer U) => any ? U : never

export type MergeInsertions<T> = T extends object
  ? { [K in keyof T]: MergeInsertions<T[K]> }
  : T

export type DeepMerge<F, S> = MergeInsertions<{
  [K in keyof F | keyof S]: K extends keyof S & keyof F
    ? DeepMerge<F[K], S[K]>
    : K extends keyof S
      ? S[K]
      : K extends keyof F
        ? F[K]
        : never
}>

export interface Constructable {
  new (...args: any[]): any
}

export interface ParsedStack {
  method: string
  file: string
  line: number
  column: number
}

export interface SerializedError {
  message: string
  stacks?: ParsedStack[]
  stack?: string
  name?: string
  cause?: SerializedError
  [key: string]: unknown
}

export interface TestError extends SerializedError {
  cause?: TestError
  diff?: string
  actual?: string
  expected?: string
}
