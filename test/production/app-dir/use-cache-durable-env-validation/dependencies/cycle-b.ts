import { readCycleA } from './cycle-a'

export function readCycleB(depth: number): string {
  return `${readCycleA(depth)}:${process.env.UNSTABLE_DURABLE_TEST}`
}
