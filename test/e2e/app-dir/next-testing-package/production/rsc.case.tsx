import { expect, test } from 'next/experimental/testing/vitest'
import { rsc } from 'next/experimental/testing/rsc'
import Subject from './server-subject'

test('production RSC renders an async server-only subject', async () => {
  const result = await rsc.render(
    Subject,
    { label: 'Packed' },
    {
      cacheScope: 'file',
      url: 'http://localhost/packed-production',
    }
  )
  expect(result.text).toBe('Packed: production')
})
