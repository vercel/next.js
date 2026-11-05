globalThis.constInitializerEffects = []

export function effect(value) {
  globalThis.constInitializerEffects.push(value)
  return value
}

export const iterable = {
  *[Symbol.iterator]() {
    effect('spread')
    yield 'value'
  },
}
