const GlobalURLPattern =
  // @ts-expect-error: URLPattern is not available in Node.js
  typeof URLPattern === 'undefined' ? undefined : URLPattern

export default GlobalURLPattern
