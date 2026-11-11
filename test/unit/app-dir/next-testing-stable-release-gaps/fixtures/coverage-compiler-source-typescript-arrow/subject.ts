export function choose<T>(value: T): 'yes' | 'no' {
  if (value) return 'yes'
  return 'no'
}
export const double = (value: number): number => value * 2
export function unused(value: number): number {
  return value + 3
}
