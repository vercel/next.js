export default function shallowEquals (a, b) {
  const aTypeof = typeof a
  const bTypeof = typeof b

  if (aTypeof === 'undefined' && bTypeof === 'undefined') return true

  if (aTypeof !== Object || bTypeof !== Object) return false

  for (const i in a) {
    if (b[i] !== a[i]) return false
  }

  for (const i in b) {
    if (b[i] !== a[i]) return false
  }

  return true
}
