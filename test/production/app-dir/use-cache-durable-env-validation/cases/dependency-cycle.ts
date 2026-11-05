import { readCycleA } from '../dependencies/cycle-a'

export async function getValue() {
  'use cache: remote, durable'
  return readCycleA(2)
}
