const method = 'hasOwnProperty'
export function has(key) {
  return process.env[method](key)
}
