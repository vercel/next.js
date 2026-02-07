// imports polyfill from `@next/polyfill-module` after build.
import '../build/polyfills/polyfill-module'

// Only setup devtools in development
if (process.env.NODE_ENV !== 'production') {
  require('../next-devtools/userspace/app/app-dev-overlay-setup') as typeof import('../next-devtools/userspace/app/app-dev-overlay-setup')
}

// Expose a testing API that allows e2e tests to assert on the prefetched UI
// state before dynamic data streams in. Browser-only.
if (process.env.__NEXT_EXPOSE_TESTING_API && typeof window !== 'undefined') {
  const { acquireNavigationLock, releaseNavigationLock } =
    require('./components/segment-cache/navigation-testing-lock') as typeof import('./components/segment-cache/navigation-testing-lock')

  window.__EXPERIMENTAL_NEXT_TESTING__ = {
    navigation: {
      lock: acquireNavigationLock,
      unlock: releaseNavigationLock,
    },
  }
}
