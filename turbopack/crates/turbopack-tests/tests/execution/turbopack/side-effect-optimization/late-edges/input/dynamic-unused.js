import { value } from './pure-dep.js'

export function load() {
  return import('./dynamic-effect.js')
}

export const derived = value + 1
