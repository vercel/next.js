// This file is for modularized imports for next/server to get fully-treeshaking.
// Export the default export and named export for the same module for typing resolving.
const GlobalURLPattern =
  // @ts-expect-error: URLPattern is not available in Node.js
  typeof URLPattern === 'undefined' ? undefined : URLPattern

export default GlobalURLPattern
export { GlobalURLPattern as URLPattern }
