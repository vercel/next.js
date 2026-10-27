export let value = 0

export function getValue() {
  return value
}

export function increment() {
  value++
}

export function setValue(next) {
  value = next
}

export function unused() {
  throw new Error('unused')
}
