export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}
