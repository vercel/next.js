import { runTests } from './utils'

// Skip in Turbopack as Yarn PnP is not supported.
// @force-gate !turbopack
describe('yarn PnP', () => {
  runTests('mdx', '/', ['MDX as a Server Component'])
})
