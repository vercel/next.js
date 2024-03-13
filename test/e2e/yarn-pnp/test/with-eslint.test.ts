import { runTests } from './utils'
;(process.env.TURBOPACK ? describe.skip : describe)('yarn PnP', () => {
  runTests('with-eslint', '/', ['<html', 'Home', 'fake-script'])
})
