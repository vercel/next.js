import { unusedServerUtility } from './unused-server-utility.js'

export function usedServerUtility() {
  return 'This is Server Utility'
}

export function unusedServerUtilityExport() {
  return unusedServerUtility()
}
