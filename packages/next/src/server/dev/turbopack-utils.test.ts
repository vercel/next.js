import { shouldEmitOnceWarning } from './turbopack-utils'
import type { Issue } from '../../build/swc/types'

function invalidPageConfigIssue(filePath: string): Issue {
  return {
    severity: 'warning',
    stage: 'collect',
    filePath,
    title: { type: 'text', value: 'Invalid page configuration' },
    description: {
      type: 'text',
      value: 'The page config is invalid.',
    },
  } as unknown as Issue
}

describe('shouldEmitOnceWarning', () => {
  it('deduplicates across fresh issue objects with identical content', () => {
    // Each subscription emission rebuilds issue objects, so identity-based
    // dedupe never matches: the same warning must still emit only once.
    const first = invalidPageConfigIssue('pages/once-a.tsx')
    const second = invalidPageConfigIssue('pages/once-a.tsx')
    expect(first).not.toBe(second)
    expect(shouldEmitOnceWarning(first)).toBe(true)
    expect(shouldEmitOnceWarning(second)).toBe(false)
    expect(
      shouldEmitOnceWarning(invalidPageConfigIssue('pages/once-a.tsx'))
    ).toBe(false)
  })

  it('still emits distinct warnings', () => {
    expect(
      shouldEmitOnceWarning(invalidPageConfigIssue('pages/another-b.tsx'))
    ).toBe(true)
  })
})
