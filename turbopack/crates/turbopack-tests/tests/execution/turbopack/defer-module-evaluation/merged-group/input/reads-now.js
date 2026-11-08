import { value, increment } from './library/shared.js'

increment()

export const readNow = value

export function incrementNow() {
  increment()
}
