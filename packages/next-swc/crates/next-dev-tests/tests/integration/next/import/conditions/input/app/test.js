'use client'

import { useTestHarness } from '@turbo/pack-test-harness'

export default function Test() {
  useTestHarness(runTests)
}

async function getJson(url) {
  const res = await fetch(url)
  const text = await res.text()
  const jsonText = /(\{[^}]*\})/.exec(text)
  return JSON.parse(jsonText[0].replace(/&quot;/g, '"'))
}

function runTests() {
  it('page with nodejs runtime should import node conditions', async () => {
    const json = await getJson('/page-nodejs')
    expect(json).toMatchObject({
      edgeThenNode: 'node',
      nodeThenEdge: 'node',
    })
  })

  it('page with edge runtime should import edge conditions', async () => {
    const json = await getJson('/page-edge')
    // TODO We don't currently support edge config in page rendering.
    // When we do, this needs to be updated.
    expect(json).not.toMatchObject({
      edgeThenNode: 'edge',
      nodeThenEdge: 'edge',
    })
    // TODO: delete this.
    expect(json).toMatchObject({
      edgeThenNode: 'node',
      nodeThenEdge: 'node',
    })
  })

  it('page api with nodejs runtime should import node conditions', async () => {
    const json = await getJson('/api/api-nodejs')
    expect(json).toMatchObject({
      edgeThenNode: 'node',
      nodeThenEdge: 'node',
    })
  })

  it('page api with edge runtime should import edge conditions', async () => {
    const json = await getJson('/api/api-edge')
    expect(json).toMatchObject({
      edgeThenNode: 'edge',
      nodeThenEdge: 'edge',
    })
  })

  it('app with nodejs runtime should import node conditions', async () => {
    const json = await getJson('/app-nodejs')
    expect(json).toMatchObject({
      edgeThenNode: 'node',
      nodeThenEdge: 'node',
    })
  })

  it('app with edge runtime should import edge conditions', async () => {
    const json = await getJson('/app-edge')
    // TODO We don't currently support edge config in app rendering.
    // When we do, this needs to be updated.
    expect(json).not.toMatchObject({
      edgeThenNode: 'edge',
      nodeThenEdge: 'edge',
    })
    // TODO: delete this.
    expect(json).toMatchObject({
      edgeThenNode: 'node',
      nodeThenEdge: 'node',
    })
  })

  it('app route with nodejs runtime should import node conditions', async () => {
    const json = await getJson('/route-nodejs')
    expect(json).toMatchObject({
      edgeThenNode: 'node',
      nodeThenEdge: 'node',
    })
  })

  it('app route with edge runtime should import edge conditions', async () => {
    const json = await getJson('/route-edge')
    expect(json).toMatchObject({
      edgeThenNode: 'edge',
      nodeThenEdge: 'edge',
    })
  })

  it('middleware should import edge conditions', async () => {
    const res = await fetch('/middleware')
    const json = await res.json()
    expect(json).toMatchObject({
      edgeThenNode: 'edge',
      nodeThenEdge: 'edge',
    })
  })
}
