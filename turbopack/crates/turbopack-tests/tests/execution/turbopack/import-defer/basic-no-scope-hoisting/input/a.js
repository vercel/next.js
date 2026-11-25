import { log } from './log.js'
import { b } from './b.js'

log.push('a')

export const value = 'a' + b
export let counter = 0
export function increment() {
  counter++
}
export default 'default-a'
