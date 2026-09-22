import './cyclic-y.js'
import { value } from './pure-dep.js'

export function load() {
  return require('./cyclic-effect.cjs')
}

export const derived = value + 1
