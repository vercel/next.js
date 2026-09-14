import { FileRef } from 'e2e-utils'
import path from 'path'

export const FILES = {
  standard: {
    app: new FileRef(path.join(__dirname, 'standard', 'app')),
    pages: new FileRef(path.join(__dirname, 'standard', 'pages')),
    public: new FileRef(path.join(__dirname, 'standard', 'public')),
    'instrumentation.ts': new FileRef(
      path.join(__dirname, 'standard', 'instrumentation.ts')
    ),
    'middleware.ts': new FileRef(
      path.join(__dirname, 'standard', 'middleware.ts')
    ),
    'next.config.js': new FileRef(
      path.join(__dirname, 'standard', 'next.config.js')
    ),
  },
  cacheComponents: {
    app: new FileRef(path.join(__dirname, 'cache-components', 'app')),
    'next.config.js': new FileRef(
      path.join(__dirname, 'cache-components', 'next.config.js')
    ),
    'proxy.ts': new FileRef(
      path.join(__dirname, 'cache-components', 'proxy.ts')
    ),
  },
}
