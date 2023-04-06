export class ReflectAdapter {
  static get<T extends object, P extends keyof T>(
    target: T,
    prop: P | symbol,
    receiver?: unknown
  ): T[P] | undefined {
    if (typeof prop === 'symbol') {
      return undefined
    }

    const value = target[prop]
    if (typeof value === 'function') {
      return value.bind(receiver)
    }

    return value
  }

  static set<T extends object, P extends keyof T>(
    target: T,
    prop: P | symbol,
    value: T[P] | any
  ): boolean {
    if (typeof prop !== 'symbol') {
      target[prop] = value
    }
    return true
  }

  static has<T extends object, P extends keyof T>(
    target: T,
    prop: P | symbol
  ): boolean {
    if (typeof prop === 'symbol') {
      return false
    }
    return prop in target
  }

  static deleteProperty<T extends object, P extends keyof T>(
    target: T,
    prop: P | symbol
  ): boolean {
    if (typeof prop !== 'symbol') {
      delete target[prop]
    }
    return true
  }
}
