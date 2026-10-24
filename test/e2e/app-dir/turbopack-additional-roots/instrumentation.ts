import linked from './linked'

export function register() {
  if (!linked.value) {
    throw new Error('Expected the linked package to be available')
  }
}
