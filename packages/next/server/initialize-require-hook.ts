import {
  loadRequireHook,
  overrideBuiltInReactPackages,
} from '../build/webpack/require-hook'

loadRequireHook()

if (process.env.NEXT_PREBUNDLED_REACT) {
  overrideBuiltInReactPackages()
}
