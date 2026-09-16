export const constant = 'constant'

export default function constantDefault() {
  return this === undefined ? 'constant-default' : 'wrong-this'
}

export let live = 'initial'

export function setLive(value) {
  live = value
}
