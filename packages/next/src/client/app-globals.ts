// imports polyfill from `@next/polyfill-module` after build.
import '../build/polyfills/polyfill-module'

// Only setup devtools in development
if (process.env.NODE_ENV !== 'production') {
  require('../next-devtools/userspace/app/app-dev-overlay-setup') as typeof import('../next-devtools/userspace/app/app-dev-overlay-setup')
}
