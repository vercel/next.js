import { setFlagsFromString } from 'node:v8'

let isYoung: ((value: object) => boolean) | undefined

/**
 * Whether V8 keeps `value` in the young generation, which minor garbage
 * collections free.
 */
export function inYoungGeneration(value: object): boolean {
  if (!isYoung) {
    setFlagsFromString('--allow-natives-syntax')
    // The V8 intrinsic only parses while the flag is set.
    // eslint-disable-next-line no-new-func
    isYoung = new Function('value', 'return %InYoungGeneration(value)') as (
      value: object
    ) => boolean
    isYoung({})
    setFlagsFromString('--no-allow-natives-syntax')
  }
  return isYoung(value)
}

/**
 * A function that V8 allocates in the old generation: a function expression
 * that is assigned to a property.
 */
export function createControl(): object {
  const holder: { fn?: () => object } = {}
  holder.fn = () => holder
  return holder.fn
}
