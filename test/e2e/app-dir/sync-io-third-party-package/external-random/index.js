// Like a database client that generates an ID while connecting.
export function createToken() {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).join('')
}
