export default function shallowEquals (a, b) {
  for (const i in a) {
    if (b[i] !== a[i]) return false
  }

  for (const i in b) {
    if (b[i] !== a[i]) return false
  }

  return true
}
