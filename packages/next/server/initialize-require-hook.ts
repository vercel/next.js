import {
  loadRequireHook,
  overrideBuiltInReactPackages,
} from '../build/webpack/require-hook'

loadRequireHook()

const isPrebundled = false

if (isPrebundled) {
  overrideBuiltInReactPackages()
}
