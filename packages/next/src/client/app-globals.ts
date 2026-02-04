// imports polyfill from `@next/polyfill-module` after build.
import '../build/polyfills/polyfill-module'

// Only setup devtools in development
if (process.env.NODE_ENV !== 'production') {
  require('../next-devtools/userspace/app/app-dev-overlay-setup') as typeof import('../next-devtools/userspace/app/app-dev-overlay-setup')
}

// Expose a testing API that allows e2e tests to assert on the prefetched UI
// state before dynamic data streams in. Dev-only, browser-only.
if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
  const { acquireNavigationLock, releaseNavigationLock } =
    require('./components/segment-cache/dev-navigation-lock') as typeof import('./components/segment-cache/dev-navigation-lock')

  window.__EXPERIMENTAL_NEXT_TESTING__ = {
    navigation: {
      lock: acquireNavigationLock,
      unlock: releaseNavigationLock,
    },
  }
}
