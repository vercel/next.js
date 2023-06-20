export class ReflectAdapter {
  static get<T extends object>(
    target: T,
    prop: string | symbol,
    receiver: unknown
  ): any {
    const value = Reflect.get(target, prop, receiver)
    if (typeof value === 'function') {
      return value.bind(target)
    }

    return value
  }

  static set<T extends object>(
    target: T,
    prop: string | symbol,
    value: any,
    receiver: any
  ): boolean {
    return Reflect.set(target, prop, value, receiver)
  }

  static has<T extends object>(target: T, prop: string | symbol): boolean {
    return Reflect.has(target, prop)
  }

  static deleteProperty<T extends object>(
    target: T,
    prop: string | symbol
  ): boolean {
    return Reflect.deleteProperty(target, prop)
  }
}
