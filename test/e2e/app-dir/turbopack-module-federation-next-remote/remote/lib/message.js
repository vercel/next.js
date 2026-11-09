import { used } from './dependency'

export const message = used

export async function lazyMessage() {
  const { late } = await import('./late.js')
  return late
}
