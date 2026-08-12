export default function ThrowsServerPage() {
  // Surface a server-side error whose original stack frame should trace back to
  // this project file. Server source maps also omit inlined content on demand,
  // so the code frame is rendered by reading the source from turbopack.
  throw new Error('boom from throws server page')
}
