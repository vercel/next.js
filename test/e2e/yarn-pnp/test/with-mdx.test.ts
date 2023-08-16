import { runTests } from './utils'

describe('yarn PnP', () => {
  runTests('with-mdx', '/', ['Look, a button', 'Hello'])
})
