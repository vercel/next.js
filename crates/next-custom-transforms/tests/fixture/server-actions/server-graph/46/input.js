// This is for testing the "information byte" of Server Action / Cache IDs.

// Should be 1 110000 0, which is "e0" in hex.
async function f1(a, b) {
  'use cache'
  return [a, b]
}

// Should be 0 110000 0, which is "60" in hex.
async function f2(a, b) {
  'use server'
  return [a, b]
}

// Should be 1 111111 1, which is "ff" in hex.
async function f3(a, b, ...rest) {
  'use cache'
  return [a, b, rest]
}

// Should be 0 111110 0, which is "7c" in hex.
async function f4(a, b, c, d, e) {
  'use server'
  return [a, b, c, d, e]
}

// Should be 0 111111 0, which is "7e" in hex.
async function f5(a, b, c, d, e, f) {
  'use server'
  return [a, b, c, d, e, f]
}

// Should be 1 111111 1, which is "ff" in hex.
async function f6(a, b, c, d, e, f, g) {
  'use cache'
  return [a, b, c, d, e, f, g]
}
