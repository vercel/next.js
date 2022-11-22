type Flattened<T> = T extends Array<infer U> ? Flattened<U> : T

/**
 * Returns a new list by pulling every item out of it (and all its sub-arrays)
 * and putting them in a new array, depth-first. Stolen from Ramda.
 */
export function flatten<T extends readonly any[]>(list: T): Flattened<T>[] {
  let jlen: number,
    j: number,
    value,
    idx = 0,
    result = []

  while (idx < list.length) {
    if (Array.isArray(list[idx])) {
      value = flatten(list[idx])
      j = 0
      jlen = value.length
      while (j < jlen) {
        result[result.length] = value[j]
        j += 1
      }
    } else {
      result[result.length] = list[idx]
    }
    idx += 1
  }

  return result as Flattened<T>[]
}
