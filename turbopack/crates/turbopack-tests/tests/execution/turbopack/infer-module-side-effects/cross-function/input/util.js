export function cached(getter) {
  const set = false
  return {
    get value() {
      if (!set) {
        const value = getter()
        Object.defineProperty(this, 'value', { value })
        return value
      }
      throw new Error('cached value already set')
    },
  }
}
export const allowsEval = cached(() => {
  try {
    const F = Function
    new F('')
    return true
  } catch (_) {
    return false
  }
})

export function exec(foo) {
  return 'x ' + foo
}
