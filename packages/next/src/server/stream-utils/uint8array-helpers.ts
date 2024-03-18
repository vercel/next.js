/**
 * Find the starting index of Uint8Array `b` within Uint8Array `a`.
 */
export function indexOfUint8Array(a: Uint8Array, b: Uint8Array) {
  if (a.length === 0 || b.length === 0 || b.length > a.length) return -1

  // start iterating through `a`
  for (let i = 0; i <= a.length - b.length; i++) {
    let completeMatch = true
    // from index `i`, iterate through `b` and check for mismatch
    for (let j = 0; j < b.length; j++) {
      // if the values do not match, then this isn't a complete match, exit `b` iteration early and iterate to next index of `a`.
      if (a[i + j] !== b[j]) {
        completeMatch = false
        break
      }
    }

    if (completeMatch) {
      return i
    }
  }

  return -1
}

/**
 * Check if two Uint8Arrays are strictly equivalent.
 */
export function isEquivalentUint8Arrays(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

/**
 * Remove Uint8Array `b` from Uint8Array `a`.
 *
 * If `b` is not in `a`, `a` is returned unchanged.
 *
 * Otherwise, the function returns a new Uint8Array instance with size `a.length - b.length`
 */
export function removeFromUint8Array(a: Uint8Array, b: Uint8Array) {
  const tagIndex = indexOfUint8Array(a, b)
  if (tagIndex > -1) {
    const removed = new Uint8Array(a.length - b.length)
    removed.set(a.slice(0, tagIndex))
    removed.set(a.slice(tagIndex + b.length), tagIndex)
    return removed
  } else {
    return a
  }
}

/**
 * Combines two Uint8Arrays together in order.
 *
 * `(a, b)` will be returned as `a + b`
 */
export function concatUint8Arrays(a: Uint8Array, b: Uint8Array) {
  const result = new Uint8Array(a.length + b.length)
  result.set(a)
  result.set(b, a.length)
  return result
}
