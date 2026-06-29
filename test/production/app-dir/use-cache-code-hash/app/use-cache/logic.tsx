import { foo } from './foo'
// @ts-ignore
import { external } from 'external-dep'

export async function logic() {
  'use cache'
  return `${foo()}:${external()}`
}
