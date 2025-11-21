import { runTests } from './utils'
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)('yarn PnP', () => {
  runTests('with-eslint', '/', ['<html', 'Home', 'fake-script'])
})
