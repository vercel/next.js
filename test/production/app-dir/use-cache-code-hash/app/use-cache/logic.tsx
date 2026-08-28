import { foo } from './foo'
// @ts-ignore
import { external } from 'external-dep'

export async function logic() {
  'use cache'

  // Should not be listed
  globalThis.foo = process.env.MY_OIDC_TOKEN

  return `${foo()}:${external()}:${process.env.BUNDLED_NON_INLINED_ENVVAR}`
}
