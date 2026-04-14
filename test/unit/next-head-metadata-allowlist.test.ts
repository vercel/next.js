/* eslint-env jest */
// Import source so the test does not depend on dist/ being rebuilt (next/head resolves to dist).
import { HEAD_METADATA_CONTENT_TYPES } from '../../packages/next/src/shared/lib/head'

describe('next/head metadata allowlist', () => {
  it('includes WHATWG metadata content elements for document head', () => {
    for (const tag of [
      'title',
      'meta',
      'link',
      'script',
      'noscript',
      'style',
      'base',
      'template',
    ]) {
      expect(HEAD_METADATA_CONTENT_TYPES.has(tag)).toBe(true)
    }
  })

  it('excludes document/body tags that commonly break head management', () => {
    for (const tag of ['html', 'body', 'div']) {
      expect(HEAD_METADATA_CONTENT_TYPES.has(tag)).toBe(false)
    }
  })
})
