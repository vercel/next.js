// React 18 compatibility classifiers used by the element serializer.
// This aliased package does not publish declarations.
declare module 'react-is-18' {
  export function isAsyncMode(value: unknown): boolean
  export function isConcurrentMode(value: unknown): boolean
  export function isContextConsumer(value: unknown): boolean
  export function isContextProvider(value: unknown): boolean
  export function isElement(value: unknown): boolean
  export function isForwardRef(value: unknown): boolean
  export function isFragment(value: unknown): boolean
  export function isLazy(value: unknown): boolean
  export function isMemo(value: unknown): boolean
  export function isPortal(value: unknown): boolean
  export function isProfiler(value: unknown): boolean
  export function isStrictMode(value: unknown): boolean
  export function isSuspense(value: unknown): boolean
  export function isSuspenseList(value: unknown): boolean
  export function isValidElementType(value: unknown): boolean
}
