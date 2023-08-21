'use client'

import { useTestHarness } from '@turbo/pack-test-harness'

export default function Test() {
  useTestHarness(runTests)
}

async function getJson(url) {
  const res = await fetch(url)
  const text = await res.text()
  const regex = /<div id="(\w+)">(\{[^}]*\})/g
  const matches = text.matchAll(regex)
  const result = {}
  try {
    for (const match of matches) {
      result[match[1]] = JSON.parse(match[2].replace(/&quot;/g, '"'))
    }
    return result
  } catch (err) {
    throw new Error(`Expected JSON but got:\n${text}`)
  }
}

async function getJsonApi(url) {
  const res = await fetch(url)
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch (err) {
    throw new Error(`Expected JSON but got:\n${text}`)
  }
}

function runTests() {
  it('page with nodejs runtime should import node conditions', async () => {
    const json = await getJson('/page-nodejs')
    expect(json).toMatchObject({
      server: {
        edgeThenNode: 'node',
        nodeThenEdge: 'node',
        reactServer: 'default',
      },
    })
  })

  it('page with edge runtime should import edge conditions', async () => {
    const json = await getJson('/page-edge')
    // TODO We don't currently support edge config in page rendering.
    // When we do, this needs to be updated.
    expect(json).not.toMatchObject({
      server: {
        edgeThenNode: 'edge',
        nodeThenEdge: 'edge',
        reactServer: 'default',
      },
    })
    // TODO: delete this.
    expect(json).toMatchObject({
      server: {
        edgeThenNode: 'node',
        nodeThenEdge: 'node',
        reactServer: 'default',
      },
    })
  })

  it('page api with nodejs runtime should import node conditions', async () => {
    const json = await getJsonApi('/api/api-nodejs')
    expect(json).toMatchObject({
      edgeThenNode: 'node',
      nodeThenEdge: 'node',
      reactServer: 'default',
    })
  })

  it('page api with edge runtime should import edge conditions', async () => {
    const json = await getJsonApi('/api/api-edge')
    expect(json).toMatchObject({
      edgeThenNode: 'edge',
      nodeThenEdge: 'edge',
      reactServer: 'default',
    })
  })

  it('app with nodejs runtime should import node conditions', async () => {
    const json = await getJson('/app-nodejs')
    expect(json).toMatchObject({
      server: {
        edgeThenNode: 'node',
        nodeThenEdge: 'node',
        reactServer: 'react-server',
      },
      client: {
        edgeThenNode: 'node',
        nodeThenEdge: 'node',
        reactServer: 'default',
      },
    })
  })

  it('app with edge runtime should import edge conditions', async () => {
    const json = await getJson('/app-edge')
    expect(json).toMatchObject({
      server: {
        edgeThenNode: 'edge',
        nodeThenEdge: 'edge',
        reactServer: 'react-server',
      },
      client: {
        edgeThenNode: 'edge',
        nodeThenEdge: 'edge',
        reactServer: 'default',
      },
    })
  })

  it('app route with nodejs runtime should import node conditions', async () => {
    const json = await getJsonApi('/route-nodejs')
    expect(json).toMatchObject({
      edgeThenNode: 'node',
      nodeThenEdge: 'node',
      reactServer: 'react-server',
    })
  })

  it('app route with edge runtime should import edge conditions', async () => {
    const json = await getJsonApi('/route-edge')
    expect(json).toMatchObject({
      edgeThenNode: 'edge',
      nodeThenEdge: 'edge',
      reactServer: 'react-server',
    })
  })

  it('middleware should import edge conditions', async () => {
    const json = await getJsonApi('/middleware')
    expect(json).toMatchObject({
      edgeThenNode: 'edge',
      nodeThenEdge: 'edge',
      reactServer: 'default',
    })
  })
}
