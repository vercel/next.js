import { createNextDescribe } from 'e2e-utils'
import { runTest } from './index.test'

createNextDescribe(
  'app dir - not found navigation - with overridden node env',
  {
    files: __dirname,
    env: { NODE_ENV: 'test' },
  },
  ({ next }) => {
    runTest({ next })
  }
)
