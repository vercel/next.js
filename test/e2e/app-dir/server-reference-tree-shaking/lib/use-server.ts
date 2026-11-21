import { expensive } from './heavy/use-server'

export function lightweight() {
  return 'use-server: lightweight'
}

export async function unusedHeavyOperation() {
  async function action() {
    'use server'
    return expensive()
  }

  return action()
}
