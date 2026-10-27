import { markInjected } from './setup'

export async function register() {
  markInjected('second')
}
