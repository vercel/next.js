import { sharedValue } from './shared'

export function deepValue(value: string) {
  return sharedValue(`${value}/deep`)
}
