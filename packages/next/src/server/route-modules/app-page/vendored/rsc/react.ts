import { createProfilingSuspense } from '../../../../app-render/profiling-suspense'

const ReactRSC = (
  require('../../module.compiled') as typeof import('../../module.compiled')
).vendored['react-rsc']!.React

// Always wrap Suspense with profiling wrapper.
// The wrapper checks at render time if the collector is active.
// If not, it renders the original Suspense without markers.
module.exports = Object.assign({}, ReactRSC, {
  Suspense: createProfilingSuspense(ReactRSC.Suspense, ReactRSC),
})
