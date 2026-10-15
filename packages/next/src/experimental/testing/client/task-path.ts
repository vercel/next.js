/** Browser artifact source names are normalized to forward slashes. */
export function basename(value: string) {
  return value.slice(value.lastIndexOf('/') + 1)
}
