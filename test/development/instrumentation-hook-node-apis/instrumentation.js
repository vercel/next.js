export function register() {
  // Uses a Node.js-only API. This must not surface edge-runtime compat
  // issues in dev when the app has no edge-runtime consumers.
  process.on('warning', () => {})
  console.log(`instrumentation hook registered (${process.env.NEXT_RUNTIME})`)
}
