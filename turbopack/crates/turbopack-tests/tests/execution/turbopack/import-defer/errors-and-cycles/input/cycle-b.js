import { name } from './cycle-a.js'

export function value() {
  return 'b:' + name
}
