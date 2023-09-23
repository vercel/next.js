/**
 * Formats the manifest depending on the environment variable
 * `NEXT_MANIFEST_FORMATTER`. If it's set to `pretty`, it will
 * return a pretty printed JSON string, otherwise it will return
 * a minified JSON string.
 */
export function formatManifest<T extends object>(manifest: T): string {
  if (process.env.NEXT_MANIFEST_FORMATTER === 'pretty') {
    return JSON.stringify(manifest, null, 2)
  }

  return JSON.stringify(manifest)
}
