throw new Error('UNIMPORTED_MUST_NOT_EXECUTE')
export function untouched<T>(value: T): T {
  return value
}
export function never(value: number): number {
  return value + 1
}
