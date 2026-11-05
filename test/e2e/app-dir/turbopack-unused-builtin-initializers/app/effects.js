export const effects = []

function callback(value) {
  effects.push('callback')
  return value
}

// These result bindings must stay unused: evaluating each initializer still
// invokes user code, even though the built-in itself does not mutate globals.
// eslint-disable-next-line no-unused-vars -- An unused result triggers initializer pruning.
const unusedArray = Array.from([1], callback)

const iterable = {
  *[Symbol.iterator]() {
    effects.push('iterator')
    yield ['key', 'value']
  },
}
// eslint-disable-next-line no-unused-vars -- An unused result triggers initializer pruning.
const unusedMap = new Map(iterable)

const source = {
  get property() {
    effects.push('getter')
    return 'value'
  },
}
// eslint-disable-next-line no-unused-vars -- An unused result triggers initializer pruning.
const unusedValues = Object.values(source)

export function read() {
  return effects
}
