export { queries, prettyDOM } from '@testing-library/dom'
import * as matcherExports from '@testing-library/jest-dom/matchers'

export const domMatchers = Object.fromEntries(
  Object.entries(matcherExports).filter(
    ([name, matcher]) => name !== 'default' && typeof matcher === 'function'
  )
)
