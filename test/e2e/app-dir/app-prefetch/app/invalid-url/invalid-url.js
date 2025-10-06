// We need a URL that reliably fails `new URL(url, window.location)
// This only fails if `window.location` starts with `https://`:
//
//   const invalidUrl = 'http:'
//
// because `new URL('http:', 'http://localhost:3000')` works fine.
// So better to pick something that's always invalid
export const INVALID_URL = '///'
