import { URLPattern } from 'next/server'
import { getQuery } from './get-query'

export function urlPatternTest(req) {
  const { pattern: givenPattern, test } = getQuery(['pattern', 'test'], req)
  const pattern = new URLPattern(givenPattern)
  const result = pattern.exec(test)
  return {
    test,
    pattern: givenPattern,
    pathname: result?.pathname,
  }
}
