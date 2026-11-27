import { getThirdPartyPackageName } from './third-party-package'

describe('getThirdPartyPackageName', () => {
  it.each([
    ['/app/node_modules/external-time/index.js', 'external-time'],
    ['file:///app/node_modules/external-time/dist/index.js', 'external-time'],
    ['[project]/node_modules/embla-carousel/esm/index.js', 'embla-carousel'],
    ['webpack://_N_E/./node_modules/pg/lib/client.js', 'pg'],
    ['webpack-internal:///(ssr)/./node_modules/pg/lib/client.js', 'pg'],
    ['node_modules/pg/lib/client.js', 'pg'],
    ['C:\\app\\node_modules\\external-time\\index.js', 'external-time'],
    ['/app/node_modules/@scope/pkg/index.js', '@scope/pkg'],
    [
      '/app/node_modules/.pnpm/embla-carousel@8.0.0/node_modules/embla-carousel/index.js',
      'embla-carousel',
    ],
    [
      '/app/node_modules/.pnpm/@scope+pkg@1.0.0/node_modules/@scope/pkg/index.js',
      '@scope/pkg',
    ],
    // The innermost package is the one that made the call.
    [
      '/app/node_modules/embla-carousel-react/node_modules/embla-carousel/index.js',
      'embla-carousel',
    ],
  ])('attributes %s to %s', (file, expected) => {
    expect(getThirdPartyPackageName(file)).toBe(expected)
  })

  it.each([
    ['/app/app/page.js'],
    ['[project]/app/page.tsx'],
    ['node:internal/process/task_queues'],
    ['<anonymous>'],
    ['/app/node_modules/next/dist/server/app-render/app-render.js'],
    [
      '/app/node_modules/.pnpm/next@16.5.0/node_modules/next/dist/compiled/next-server/app-page-turbo.runtime.prod.js',
    ],
    ['/app/node_modules/react-dom/cjs/react-dom-server.node.production.js'],
    ['/app/node_modules/react/index.js'],
    ['/app/node_modules/scheduler/index.js'],
    ['/app/node_modules/react-server-dom-webpack/server.js'],
    ['/app/node_modules/@next/env/dist/index.js'],
    ['/app/node_modules/styled-jsx/index.js'],
    ['/app/node_modules/@swc/helpers/esm/index.js'],
    // Dependencies installed inside the framework belong to the framework.
    ['/app/node_modules/next/node_modules/some-dep/index.js'],
    ['/app/node_modules/@scope'],
    ['/app/node_modules/'],
  ])('does not attribute %s', (file) => {
    expect(getThirdPartyPackageName(file)).toBe(null)
  })
})
