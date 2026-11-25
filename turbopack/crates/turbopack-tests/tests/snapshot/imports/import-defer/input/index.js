// prettier-ignore
import defer * as lib from './lib.js'

export function useLib() {
  return lib.used
}

export async function dynamicLib() {
  // prettier-ignore
  const ns = await import.defer('./dynamic.js')
  return ns.value
}

useLib()
dynamicLib()
