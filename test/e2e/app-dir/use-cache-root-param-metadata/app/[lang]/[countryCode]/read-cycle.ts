import { readCycleLanguage } from './cycle-a'

export async function readCycle() {
  'use cache'
  return readCycleLanguage(2)
}
