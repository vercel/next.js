import { expect, test } from 'next/experimental/testing/vitest'
import { rsc } from 'next/experimental/testing/rsc'
import { completedRequests } from './app/[tenant]/ancestor/[...slug]/state'

test('cancels an active streamed route at its attempt deadline', async () => {
  await rsc.renderRoute({
    cacheScope: 'file',
    format: 'html',
    url: 'http://localhost/acme/ancestor/alpha/c?hold=1',
    headers: { 'x-route-request': 'cancelled' },
  })
}, 500)

test('drains cancelled request after work and retains the next route', async () => {
  expect(completedRequests).toEqual(['cancelled'])
  const result = await rsc.renderRoute({
    cacheScope: 'file',
    format: 'html',
    url: 'http://localhost/acme/ancestor/alpha/c',
    headers: { 'x-route-request': 'following' },
  })
  expect(result.status).toBe(200)
  expect(result.body).toContain('data-root-layout="acme"')
  expect(completedRequests).toEqual(['cancelled', 'following'])
  console.log(
    'ANCESTOR_CANCEL ' +
      JSON.stringify({
        followingStatus: result.status,
        after: completedRequests,
      })
  )
})
