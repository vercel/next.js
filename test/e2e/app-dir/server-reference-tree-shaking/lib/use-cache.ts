import { expensive } from './heavy/use-cache'

export function lightweight() {
  return 'use-cache: lightweight'
}

export async function unusedHeavyOperation() {
  async function cached() {
    'use cache'
    return expensive()
  }

  return cached()
}
