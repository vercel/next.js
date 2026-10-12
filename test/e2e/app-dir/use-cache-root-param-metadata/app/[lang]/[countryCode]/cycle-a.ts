import { lang } from 'next/root-params'
import { continueCycle } from './cycle-b'

export async function readCycleLanguage(remaining: number): Promise<string> {
  return remaining === 0 ? lang() : continueCycle(remaining - 1)
}
