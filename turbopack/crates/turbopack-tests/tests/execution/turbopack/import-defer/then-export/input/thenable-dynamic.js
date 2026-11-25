import { log } from './log.js'

log.push('thenable-dynamic')

export const value = 'dynamic-value'
export function then(resolve) {
  resolve('should not be used')
}
