type WorkFn<K, V> = (key: K) => V

export class WeakCache<K extends WeakKey, V> {
  private readonly cache = new WeakMap<K, V>()

  constructor(private readonly work: WorkFn<K, V>) {}

  public get(key: K): V {
    let value = this.cache.get(key)

    // If the value is not undefined, then return it, we got it cached.
    if (typeof value !== 'undefined') {
      return value
    }

    // Otherwise, we need to compute the value and cache it.
    value = this.work(key)
    this.cache.set(key, value)

    return value
  }
}
