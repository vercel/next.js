import { expect, test } from 'next/experimental/testing/vitest'
import { rsc } from 'next/experimental/testing/rsc'
import Subject from '../app/subject'

test('JavaScript RSC renders async server-only work', async () => {
  const result = await rsc.render(
    Subject,
    { name: 'JavaScript' },
    {
      cacheScope: 'file',
      url: 'http://localhost/javascript',
    }
  )
  expect(result.text).toBe('Hello JavaScript')
})
