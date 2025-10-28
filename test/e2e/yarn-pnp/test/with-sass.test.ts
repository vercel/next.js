import { runTests } from './utils'

// Skip in Turbopack as Yarn PnP is not supported.
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)('yarn PnP', () => {
  runTests('with-sass', '/', [
    'Hello World, I am being styled using SCSS Modules',
  ])
})
