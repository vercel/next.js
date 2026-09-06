// Clears the custom handler's backing store, simulating the remote cache being
// purged out-of-band. The dev-only in-memory front handler still holds its
// entries, so this exercises whether the tiered handler stops serving them.
export async function GET() {
  const purge = (globalThis as Record<string, unknown>).__purgeUseCacheBacking

  if (typeof purge === 'function') {
    purge()
  }

  return Response.json({ purged: true })
}
