import { log } from './log.js'

log.push('thenable')

export const value = 'value'
export function then(resolve) {
  resolve('should not be used')
}
