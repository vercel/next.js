import { unusedDynamic } from './unused-dynamic.js'

export function UsedDynamic() {
  return 'This is Dynamic'
}

export function UnusedDynamic() {
  return unusedDynamic()
}
