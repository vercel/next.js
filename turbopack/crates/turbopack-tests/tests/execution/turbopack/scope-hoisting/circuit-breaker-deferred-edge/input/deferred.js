export const deferredValue = 'deferred'

export function loadEntry() {
  return require('./index.js').entryValue
}
