export class ReflectAdapter {
  static get<T extends object>(
    target: T,
    prop: string | symbol,
    receiver?: unknown
  ): any {
    const value = target[prop as keyof T]
    if (typeof value === 'function') {
      return value.bind(receiver)
    }

    return value
  }

  static set<T extends object>(
    target: T,
    prop: string | symbol,
    value: any
  ): boolean {
    target[prop as keyof T] = value

    return true
  }

  static has<T extends object>(target: T, prop: string | symbol): boolean {
    return prop in target
  }

  static deleteProperty<T extends object>(
    target: T,
    prop: string | symbol
  ): boolean {
    delete target[prop as keyof T]
    return true
  }
}
