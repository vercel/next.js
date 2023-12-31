/**
 * Formats the manifest depending on the environment variable
 * `NODE_ENV`. If it's set to `development`, it will return a pretty printed
 * JSON string, otherwise it will return a minified JSON string.
 */
export function formatManifest<T extends object>(manifest: T): string {
  if (process.env.NODE_ENV === 'development') {
    return JSON.stringify(manifest, null, 2)
  }

  return JSON.stringify(manifest)
}
