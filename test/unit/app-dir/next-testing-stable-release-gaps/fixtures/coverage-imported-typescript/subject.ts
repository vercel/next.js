export type Answer = 'yes' | 'no'
export interface Options {
  flag: boolean
}
export function choose<T extends Options>(value: T): Answer {
  if (value.flag) return 'yes'
  return 'no'
}
export function unused(value: number): number {
  return value + 1
}
