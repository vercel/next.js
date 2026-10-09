import { expect, it } from 'vitest'
import { rsc } from 'next/experimental/testing/rsc'
import Subject from '../components/subject'
import Invalid from '../components/invalid'
import { Counter } from '../components/counter'
import { getClientReferenceManifest } from 'next/dist/server/app-render/manifests-singleton'

it('production Flight retains server-only work and real client props', async () => {
  expect(process.env.NODE_ENV).toBe('production')
  const render = (visitor) =>
    rsc.render(
      Subject,
      { initial: 10 },
      {
        cacheScope: 'file',
        url: 'http://reference.test/',
        headers: { cookie: `l3-visitor=${visitor}` },
      }
    )
  const [alice, bob] = await Promise.all([render('alice'), render('bob')])
  const repeated = await render('alice')
  const manifest = getClientReferenceManifest()
  const id = Counter.$$id
  const split = id.lastIndexOf('#')
  const reference =
    manifest.clientModules[id] ?? manifest.clientModules[id.slice(0, split)]
  if (!reference)
    throw new Error('Counter missing from emitted production client manifest')
  const expected = {
    moduleId: String(reference.id),
    exportName: manifest.clientModules[id]
      ? reference.name
      : id.slice(split + 1),
  }
  for (const [result, visitor] of [
    [alice, 'alice'],
    [bob, 'bob'],
    [repeated, 'alice'],
  ]) {
    expect(result.text).toBe(`L3_SERVER_ONLY_VALUE${visitor}`)
    expect(result.clientBoundaries).toHaveLength(1)
    expect(result.clientBoundaries[0].props).toEqual({ initial: 10 })
    expect(result.clientBoundaries[0].references).toContainEqual(expected)
  }
})

it('production Flight rejects a function crossing the client boundary', async () => {
  await expect(
    rsc.render(
      Invalid,
      {},
      { cacheScope: 'file', url: 'http://reference.test/' }
    )
  ).rejects.toThrow(/Functions cannot be passed directly to Client Components/)
})
