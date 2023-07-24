import { createNextDescribe } from 'e2e-utils'
import { runTest } from './error-boundary-and-not-found-linking.test'

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
