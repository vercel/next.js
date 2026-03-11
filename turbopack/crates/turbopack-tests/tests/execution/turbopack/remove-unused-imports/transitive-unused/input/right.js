import { foo } from './dep'
export const r = 'r'

export function unused() {
  return foo
}
