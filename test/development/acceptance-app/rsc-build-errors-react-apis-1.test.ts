import {
  registerInvalidReactApiTests,
  runRscBuildErrorsTests,
} from './rsc-build-errors.util'

// The full list of invalid react APIs is split between the two
// rsc-build-errors-react-apis-*.test.ts entries to balance CI shard times.
const invalidReactServerApis = [
  'Component',
  'createContext',
  'createFactory',
  'PureComponent',
  'useDeferredValue',
  'useEffect',
  'useEffectEvent',
  'useImperativeHandle',
  'useInsertionEffect',
]

runRscBuildErrorsTests((ctx) => {
  registerInvalidReactApiTests(ctx, 'react', invalidReactServerApis)
})
