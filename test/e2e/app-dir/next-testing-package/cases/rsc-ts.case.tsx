import { expect, test } from 'next/experimental/testing/vitest'
import { rsc } from 'next/experimental/testing/rsc'
import Subject from '../app/subject'

test('TypeScript RSC renders async server-only work', async () => {
  const result = await rsc.render(
    Subject,
    { name: 'packed' },
    {
      cacheScope: 'file',
      url: 'http://localhost/packed',
    }
  )
  expect(result.text).toBe('Hello packed')
})
