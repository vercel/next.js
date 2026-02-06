/**
 * Find the starting index of Uint8Array `b` within Uint8Array `a`.
 * Uses first-byte indexOf to skip non-matching positions quickly,
 * then verifies the full pattern match.
 */
export function indexOfUint8Array(a: Uint8Array, b: Uint8Array) {
  if (b.length === 0) return 0
  if (a.length === 0 || b.length > a.length) return -1

  const firstByte = b[0]
  const bLen = b.length
  const limit = a.length - bLen

  let i = 0
  while (i <= limit) {
    // Use native indexOf to jump to next candidate position.
    // TypedArray.indexOf is V8-optimized and much faster than a JS byte-by-byte scan.
    const idx = a.indexOf(firstByte, i)
    if (idx === -1 || idx > limit) return -1

    // Verify the full pattern at this position
    let match = true
    for (let j = 1; j < bLen; j++) {
      if (a[idx + j] !== b[j]) {
        match = false
        break
      }
    }

    if (match) return idx
    i = idx + 1
  }

  return -1
}

/**
 * Check if two Uint8Arrays are strictly equivalent.
 */
export function isEquivalentUint8Arrays(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }

  return true
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
  if (tagIndex === 0) return a.subarray(b.length)
  if (tagIndex > -1) {
    const removed = new Uint8Array(a.length - b.length)
    removed.set(a.slice(0, tagIndex))
    removed.set(a.slice(tagIndex + b.length), tagIndex)
    return removed
  } else {
    return a
  }
}
