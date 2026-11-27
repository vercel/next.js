// Serializes the runtime shape of a static image import so the test can
// compare it with the declared `StaticImageData` type.
export function describeImport(value: unknown) {
  if (typeof value !== 'object' || value === null) {
    return { type: typeof value, value: String(value) }
  }
  const { src, width, height } = value as Record<string, unknown>
  return { type: 'object', src, width, height }
}
