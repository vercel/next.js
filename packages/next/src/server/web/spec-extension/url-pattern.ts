// Typed through globalThis so the emitted declaration doesn't need the
// URLPattern lib types, which only TypeScript 6+ has.
const GlobalURLPattern:
  (typeof globalThis extends { URLPattern: infer T } ? T : any) | undefined =
  typeof URLPattern === 'undefined' ? undefined : URLPattern

export { GlobalURLPattern as URLPattern }
