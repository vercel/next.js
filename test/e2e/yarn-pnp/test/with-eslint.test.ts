import { runTests } from './utils'

describe('yarn PnP', () => {
  runTests('with-eslint', '/', ['<html', 'Home', 'fake-script'])
})
