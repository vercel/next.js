import {
  registerInvalidReactApiTests,
  runRscBuildErrorsTests,
} from './rsc-build-errors.util'

// The full list of invalid react APIs is split between the two
// rsc-build-errors-react-apis-*.test.ts entries to balance CI shard times.
const invalidReactServerApis = [
  'useLayoutEffect',
  'useReducer',
  'useRef',
  'useState',
  'useSyncExternalStore',
  'useTransition',
  'useOptimistic',
  'useActionState',
]

const invalidReactDomServerApis = [
  'flushSync',
  'unstable_batchedUpdates',
  'useFormStatus',
  'useFormState',
]

runRscBuildErrorsTests((ctx) => {
  registerInvalidReactApiTests(ctx, 'react', invalidReactServerApis)
  registerInvalidReactApiTests(ctx, 'react-dom', invalidReactDomServerApis)
})
