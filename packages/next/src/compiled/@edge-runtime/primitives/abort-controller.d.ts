declare const AbortControllerConstructor: typeof AbortController

declare const DOMExceptionConstructor: typeof DOMException

declare var AbortSignal: {
  prototype: typeof AbortSignal
  new (): typeof AbortSignal
  /** Returns an AbortSignal instance which will be aborted in milliseconds milliseconds. Its abort reason will be set to a "TimeoutError" DOMException. */
  timeout(milliseconds: number): AbortSignal
  /** Returns an AbortSignal instance whose abort reason is set to reason if not undefined; otherwise to an "AbortError" DOMException. */
  abort(reason?: string): AbortSignal
}

export { AbortControllerConstructor as AbortController, AbortSignal, DOMExceptionConstructor as DOMException };
