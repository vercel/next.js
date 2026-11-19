import { a1 } from '../a/a1.js'
import { b1 } from '../b/b1.js'
import { lazy1 } from './lazy1.js'
import { lazy2 } from './lazy2.js'
import { lazy3 } from './lazy3.js'

export function lazy() {
  return [a1, b1, lazy1, lazy2, lazy3].map((value) => value.split(':')[0])
}
