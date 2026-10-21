const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const provider = createRequire(require.resolve('jest-environment-jsdom'))
const { JSDOM } = require(provider.resolve('jsdom'))
const client = require('next/dist/experimental/testing/client/async-context')
const {
  page,
  initializeBrowserContext,
} = require('next/dist/experimental/testing/client/browser-context')
const dom = new JSDOM('<!DOCTYPE html><body></body>')
const saved = new Map(
  ['document', 'Element'].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ])
)
for (const [key, value] of [
  ['document', dom.window.document],
  ['Element', dom.window.Element],
])
  Object.defineProperty(globalThis, key, { configurable: true, value })
const scope = client.createAsyncScope(
  {
    kind: 'attempt',
    context: { id: 'negative-nth', fileId: 'file', testId: 'case' },
  },
  (error) => {
    throw error
  }
)
const leave = client.enterCreatorScope(
  scope.run(() => client.captureCreatorScope())
)
const commands = []
const binding = initializeBrowserContext(async (command) => {
  commands.push(command)
})
try {
  const query = page.getByRole('button'),
    last = query.nth(-1)
  assert.deepEqual(last.elements(), [])
  const nodes = ['First', 'Second', 'Third'].map((text) => {
    const node = document.createElement('button')
    node.textContent = text
    document.body.append(node)
    return node
  })
  const all = [-4, -3, -2, -1, 0, 1, 2, 3].map((index) =>
    query.nth(index).elements()
  )
  assert.deepEqual(all, [
    [],
    [nodes[0]],
    [nodes[1]],
    [nodes[2]],
    [nodes[0]],
    [nodes[1]],
    [nodes[2]],
    [],
  ])
  assert.equal(last.element(), nodes[2])
  assert.equal(query.last().element(), nodes[2])
  assert.equal(query.first().element(), nodes[0])
  document.body.prepend(nodes[2])
  assert.equal(last.element(), nodes[1])
  assert.deepEqual(query.nth(-2).elements(), [nodes[0]])
  nodes[1].remove()
  assert.equal(last.element(), nodes[0])
  assert.equal(query.last().element(), nodes[0])
  document.body.replaceChildren()
  assert.deepEqual(last.elements(), [])
  assert.deepEqual(query.nth(-2).elements(), [])
  assert.deepEqual(commands, [])
  scope.close()
  assert.throws(() => last.elements(), /scope/)
  process.stdout.write(
    JSON.stringify({
      negativeOne: true,
      actualNodeIdentity: true,
      liveOrder: true,
      emptyAndBounds: true,
      otherIndicesHeld: true,
      closedScopeRefused: true,
      noNativeCommandOrSyntheticEvents: true,
    }) + '\n'
  )
} finally {
  binding.dispose()
  scope.close()
  leave()
  dom.window.close()
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else Reflect.deleteProperty(globalThis, key)
  }
}
