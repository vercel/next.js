throw new Error('UNIMPORTED_MUST_NOT_EXECUTE')
export function untouched<T>(value: T): T {
  return value
}
export const never = (value: number): number => value + 1
