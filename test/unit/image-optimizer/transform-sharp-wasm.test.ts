/* eslint-env jest */
import { nativeSharpBindingSpecifier } from '../../lib/sharp-bindings'
import { runImageOptimizerTransformTests } from './transform-suite'

// Make the native binding unresolvable for this test file so sharp falls back
// to `@img/sharp-wasm32` (a devDependency of the repository), as it does for
// an app installed with `npm install --cpu=wasm32 sharp`. sharp loads its
// binding lazily, on the first `getSharp()` call, so registering the mock
// here is early enough.
const nativeBinding = nativeSharpBindingSpecifier()
jest.doMock(
  nativeBinding,
  () => {
    const error: NodeJS.ErrnoException = new Error(
      `Cannot find module '${nativeBinding}' (made unavailable by ${__filename})`
    )
    error.code = 'MODULE_NOT_FOUND'
    throw error
  },
  { virtual: true }
)

runImageOptimizerTransformTests('wasm32')
