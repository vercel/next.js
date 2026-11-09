globalThis.evaluationOrder.push('registry')

const functions = {}

export const register = (name, fn) => {
  functions[name] = fn
}

export const call = (name) => functions[name]?.()
