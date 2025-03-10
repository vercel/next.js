import { runTests } from './utils'

// Skip in Turbopack as Yarn PnP is not supported.
;(process.env.TURBOPACK ? describe.skip : describe)('yarn PnP', () => {
  runTests('with-sass', '/', [
    'Hello World, I am being styled using SCSS Modules',
  ])
})
