// The renderer interface: what the bridge calls to render a page on the native RSC
// runtime. It never sees HTTP. The renderer reports an outcome, and the bridge writes
// the status and headers. It has no engine types, so any engine binding, and later a
// native bridge, can call it unchanged.
//
// This is the first phase's subset (a page inside the root layout, rendered to HTML).
// Each later addition arrives with the step that first produces or uses it.

export interface RouteRenderer {
  renderDocument(input: DocumentInput): RenderResult
}

export interface DocumentInput {
  // Aborted when the client goes away. The render stops, and `body` errors with the
  // abort's reason. Cancelling `body` stops the render the same way.
  signal: AbortSignal
  // Called once with every error the render throws, recoverable or not. Nothing is
  // reported once the render stops, by `signal` or by cancelling `body`.
  reportError(error: unknown): void
}

export interface RenderResult {
  // Settles once the document's shell is ready, or failed to render. Nothing is
  // written before then.
  head: Promise<{ outcome: { type: 'rendered' } | { type: 'error' } }>
  // The document's bytes. Empty when the outcome is an error.
  body: ReadableStream<Uint8Array>
}
