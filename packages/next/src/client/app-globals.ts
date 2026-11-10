// imports polyfill from `@next/polyfill-module` after build.
import '../build/polyfills/polyfill-module'

// Only set up devtools for the dev server.
if (process.env.__NEXT_DEV_SERVER) {
  require('../next-devtools/userspace/app/app-dev-overlay-setup') as typeof import('../next-devtools/userspace/app/app-dev-overlay-setup')
}

// Start listening for the instant navigation test cookie. The test framework
// (e.g. Playwright) sets/clears this cookie to control the navigation lock.
// Browser-only.
if (process.env.__NEXT_EXPOSE_TESTING_API && typeof window !== 'undefined') {
  const { startListeningForInstantNavigationCookie } =
    // TODO(browser-variant): migrate to a .ts/.browser.ts split so the browser bundle drops the server branch; see scripts/generate-browser-variant-aliases.mjs
    // ast-grep-ignore: no-typeof-window-require
    require('./components/segment-cache/navigation-testing-lock') as typeof import('./components/segment-cache/navigation-testing-lock')
  startListeningForInstantNavigationCookie()
}
