import { createProfilingSuspense } from '../../../../app-render/profiling-suspense'

const ReactSSR = (
  require('../../module.compiled') as typeof import('../../module.compiled')
).vendored['react-ssr']!.React

// Always wrap Suspense with profiling wrapper.
// The wrapper checks at render time if the collector is active.
// If not, it renders the original Suspense without markers.
module.exports = Object.assign({}, ReactSSR, {
  Suspense: createProfilingSuspense(ReactSSR.Suspense),
})
