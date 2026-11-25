import { log } from './log.js'

log.push('target')

export const value = 'target-value'
export function then() {
  throw new Error('then must not be exposed')
}
