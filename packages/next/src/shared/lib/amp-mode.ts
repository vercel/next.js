export function isInAmpMode({
  ampFirst = false,
  hybrid = false,
  hasQuery = false,
} = {}): boolean {
  return ampFirst || (hybrid && hasQuery)
}
