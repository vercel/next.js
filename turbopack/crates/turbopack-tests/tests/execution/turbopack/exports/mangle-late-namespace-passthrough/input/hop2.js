import { readLate as readFromProvider } from './provider'

export function readLate() {
  return readFromProvider()
}
