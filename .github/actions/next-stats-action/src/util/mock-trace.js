/** @returns {Span} */
const createMockSpan = () => ({
  traceAsyncFn: (fn) => fn(createMockSpan()),
  traceFn: (fn) => fn(createMockSpan()),
  traceChild: () => createMockSpan(),
})

/** @typedef {{
 *   traceAsyncFn: <T>(fn: (span: Span) => Promise<T>) => Promise<T>,
 *   traceFn: <T>(fn: (span: Span) => T) => T,
 *   traceChild: (id: string, data?: Record<string, any>) => Span,
 * }} Span */

module.exports = createMockSpan
