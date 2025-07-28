export const runtime = 'edge'

export async function GET(_request: Request) {
  // This import should not be instrumented, because edge routes are never prerendered.
  // `trackDynamicImport` will throw if it's used in the edge runtime,
  // so it's enough to just do an import() here and see if it succeeds.
  const messages = (await import('./messages')).default
  return new Response(messages.title)
}
