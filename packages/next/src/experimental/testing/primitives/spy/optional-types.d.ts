// Keep disposal optional when the application omits esnext.disposable.
type DisposeMethod = {
  [Key in typeof Symbol extends {
    readonly dispose: infer Dispose extends symbol
  }
    ? Dispose
    : never]: () => void
}

export interface Disposable extends DisposeMethod {}
