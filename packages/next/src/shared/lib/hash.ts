// http://www.cse.yorku.ca/~oz/hash.html
export function djb2Hash(str: string) {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) + hash + char
  }
  return Math.abs(hash)
}

export function hexHash(str: string) {
  return djb2Hash(str).toString(16).slice(0, 7)
}
