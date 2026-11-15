import { readCycleLanguage } from './cycle-a'

export async function continueCycle(remaining: number): Promise<string> {
  return readCycleLanguage(remaining)
}
