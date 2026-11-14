import { readA } from './b'

export const value = 'a'
export function completeCycle() {
  return readA()
}
