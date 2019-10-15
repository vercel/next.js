/* global fixture, test */
import 'testcafe'
import { getSortedRoutes } from 'next/dist/next-server/lib/router/utils/sorted-routes'
import { didThrow } from 'next-test-utils'

fixture('getSortedRoutes')

test('does not add extra routes', async t => {
  await t.expect(getSortedRoutes(['/posts'])).eql(['/posts'])

  await t.expect(getSortedRoutes(['/posts/[id]'])).eql(['/posts/[id]'])
  await t.expect(getSortedRoutes(['/posts/[id]/foo'])).eql(['/posts/[id]/foo'])

  await t
    .expect(getSortedRoutes(['/posts/[id]/[foo]/bar']))
    .eql(['/posts/[id]/[foo]/bar'])
  await t
    .expect(getSortedRoutes(['/posts/[id]/baz/[foo]/bar']))
    .eql(['/posts/[id]/baz/[foo]/bar'])
})

test('correctly sorts required slugs', async t => {
  await t
    .expect(
      getSortedRoutes([
        '/posts',
        '/[root-slug]',
        '/',
        '/posts/[id]',
        '/blog/[id]/comments/[cid]',
        '/blog/[id]',
        '/foo/[d]/bar/baz/[f]',
        '/apples/[ab]/[cd]/ef'
      ])
    )
    .eql([
      '/',
      '/apples/[ab]/[cd]/ef',
      '/blog/[id]',
      '/blog/[id]/comments/[cid]',
      '/foo/[d]/bar/baz/[f]',
      '/posts',
      '/posts/[id]',
      '/[root-slug]'
    ])
})

test('catches mismatched param names', async t => {
  await didThrow(
    () =>
      getSortedRoutes([
        '/',
        '/blog',
        '/blog/[id]',
        '/blog/[id]/comments/[cid]',
        '/blog/[cid]'
      ]),
    true,
    /different slug names/
  )
})

test('catches reused param names', async t => {
  await didThrow(
    () =>
      getSortedRoutes(['/', '/blog', '/blog/[id]/comments/[id]', '/blog/[id]']),
    true,
    /the same slug name/
  )
})
