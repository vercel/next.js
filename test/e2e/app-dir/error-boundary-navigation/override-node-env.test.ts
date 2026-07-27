import { nextTestSetup } from 'e2e-utils'
import { runTest } from './index.test'

describe('app dir - not found navigation - with overridden node env', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: { NODE_ENV: 'test' },
  })

  runTest({ next })
})
