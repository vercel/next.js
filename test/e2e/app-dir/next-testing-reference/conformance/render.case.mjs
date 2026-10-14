import { expect, it } from 'vitest'
import { rsc } from 'next/dist/experimental/testing/rsc/index'
import { ReferenceSubject } from '../app/reference/subject'
import { Counter } from '../app/reference/counter'
import { getClientReferenceManifest } from 'next/dist/server/app-render/manifests-singleton'
import Nonserializable from '../negative/nonserializable'
import { completedAfter, RequestCacheProbe } from '../lib/request-probes'

const request = (visitor) => ({
  cacheScope: 'file',
  url: 'http://reference.test/reference',
  headers: { cookie: `reference-visitor=${visitor}` },
})

it('renders the canonical async subject with isolated cookies and a client prop', async () => {
  const [alice, bob] = await Promise.all([
    rsc.render(ReferenceSubject, {}, request('alice')),
    rsc.render(ReferenceSubject, {}, request('bob')),
  ])
  expect(alice.model.type).toBe('section')
  expect(bob.model.type).toBe('section')
  expect(alice.model.props.children[0].props.children).toBe('alice')
  expect(bob.model.props.children[0].props.children).toBe('bob')
  expect(alice.model.props.children[2].props.initial).toBe(10)
  expect(bob.model.props.children[2].props.initial).toBe(10)
  const repeated = await rsc.render(ReferenceSubject, {}, request('alice'))
  const manifest = getClientReferenceManifest()
  const id = Counter.$$id
  const split = id.lastIndexOf('#')
  const entry =
    manifest.clientModules[id] ?? manifest.clientModules[id.slice(0, split)]
  if (!entry)
    throw new Error('Counter must exist in the actual emitted client manifest')
  const expectedReference = {
    moduleId: String(entry.id),
    exportName: manifest.clientModules[id] ? entry.name : id.slice(split + 1),
  }
  for (const [result, visitor] of [
    [alice, 'alice'],
    [bob, 'bob'],
    [repeated, 'alice'],
  ]) {
    expect(result.text).toBe(`${visitor}server sum: 10`)
    expect(result.clientBoundaries).toHaveLength(1)
    expect(result.clientBoundaries[0].references).toContainEqual(
      expectedReference
    )
    expect(result.clientBoundaries[0].props).toEqual({ initial: 10 })
  }
})

it('shares explicit file cache and drains after work before render resolves', async () => {
  completedAfter.length = 0
  const first = await rsc.render(RequestCacheProbe, {}, request('alice'))
  expect(completedAfter).toHaveLength(1)
  const second = await rsc.render(RequestCacheProbe, {}, request('bob'))
  expect(completedAfter).toHaveLength(2)
  expect(typeof first.model).toBe('string')
  expect(second.model).toBe(first.model)
  expect(completedAfter[1]).toBe(completedAfter[0])
})

it('rejects a nonserializable client prop through the real renderer', async () => {
  await expect(
    rsc.render(Nonserializable, {}, request('alice'))
  ).rejects.toThrow(/Functions cannot be passed directly to Client Components/)
})
