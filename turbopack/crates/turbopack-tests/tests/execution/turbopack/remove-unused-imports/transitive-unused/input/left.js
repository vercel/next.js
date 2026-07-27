import { foo } from './dep'
export const l = 'l'

export function unused() {
  return foo
}
