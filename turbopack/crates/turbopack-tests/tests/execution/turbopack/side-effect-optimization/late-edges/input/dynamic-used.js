import { value } from './pure-dep.js'

export function loadDynamic() {
  return import('./dynamic-effect.js')
}

export const derived = value + 1
