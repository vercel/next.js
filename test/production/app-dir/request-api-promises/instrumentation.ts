export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { types } = await import('node:util')
    const set = WeakMap.prototype.set
    const counter = globalThis as { weakMapPromises?: number }
    counter.weakMapPromises = 0
    WeakMap.prototype.set = function (
      this: WeakMap<object, unknown>,
      key,
      value
    ) {
      if (types.isPromise(value)) {
        counter.weakMapPromises!++
      }
      return set.call(this, key, value)
    }
  }
}
