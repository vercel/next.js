import { readCycleB } from './cycle-b'

export function readCycleA(depth: number): string {
  return depth > 0 ? readCycleB(depth - 1) : 'done'
}
