export let value = 0

export function set(next: number) {
  value = next
}

export function read() {
  return value
}

export function unused() {
  throw new Error('UNUSED_FRAGMENT_FORWARDING_EXPORT')
}
