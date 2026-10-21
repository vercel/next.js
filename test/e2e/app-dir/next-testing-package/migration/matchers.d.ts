import 'vitest'

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Matches the public augmentation's type parameters.
  interface Matchers<R, T> {
    toBeDoubleOf(original: number): R
  }
  interface ProvidedContext {
    label: string
  }
}
