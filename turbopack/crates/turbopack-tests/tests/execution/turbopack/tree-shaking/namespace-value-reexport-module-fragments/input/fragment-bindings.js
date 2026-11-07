const { usedBinding, unusedBinding } = {
  usedBinding: 'used',
  unusedBinding: 'unused',
}

export function readUsed() {
  return usedBinding
}

export function readUnused() {
  return unusedBinding + 'UNUSED_FRAGMENT_FUNCTION'
}

export let counter = 0

export function increment() {
  counter += 1
}
