// This capability reports only an engine Promise route: 0 non-Promise,
// 1 exact native prototype, 2 other native Promise. It carries no scope owner
// and authored callers cannot register arbitrary values.
export const enginePromiseBrandKey = 'next.test.engine-promise-brand.v1'

const classify = (globalThis as { [key: symbol]: unknown })[
  Symbol.for(enginePromiseBrandKey)
]

export function isExactNativePromise(value: unknown): boolean {
  if (
    value === null ||
    (typeof value !== 'object' && typeof value !== 'function')
  )
    return false
  if (typeof classify !== 'function')
    throw new Error('Browser Mode engine Promise classifier is unavailable.')
  const decision: unknown = classify(value)
  if (decision !== 0 && decision !== 1 && decision !== 2)
    throw new Error('Browser Mode engine Promise decision is invalid.')
  return decision === 1
}
