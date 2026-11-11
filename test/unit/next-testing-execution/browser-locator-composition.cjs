const assert = require('node:assert/strict')
const { JSDOM } = require('jsdom')
const client = require('next/dist/experimental/testing/client/async-context')
const {
  page,
  initializeBrowserContext,
} = require('next/dist/experimental/testing/client/browser-context')

async function main() {
  const dom = new JSDOM(
    '<!DOCTYPE html><section aria-label="Scope"><button title="one">One</button><button title="two">Two</button></section>'
  )
  const values = {
    document: dom.window.document,
    Element: dom.window.Element,
    Node: dom.window.Node,
  }
  const restoreBrowserDomRealm = require('./browser-dom-realm.cjs')(dom.window)
  const saved = new Map(
    Object.keys(values).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ])
  )
  for (const [key, value] of Object.entries(values))
    Object.defineProperty(globalThis, key, { configurable: true, value })
  const scope = client.createAsyncScope(
    {
      kind: 'attempt',
      context: { id: 'locator-composition', fileId: 'file', testId: 'case' },
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
    const one = page.getByTitle('one')
    const two = page.getByRole('button', { name: 'Two' })
    const intersection = page.getByRole('button').and(one)
    const union = two.or(one).or(intersection)
    const names = (locator) =>
      locator.elements().map((element) => element.textContent)
    assert.deepEqual(names(intersection), ['One'])
    assert.deepEqual(names(union), ['One', 'Two'])
    assert.throws(
      () => union.element(),
      /strict mode violation:.*resolved to 2 elements:/
    )
    assert.equal(await union.first().click({ button: 'right' }), undefined)
    assert.deepEqual(
      commands.map(({ method, args }) => ({ method, args })),
      [{ method: 'click', args: [{ button: 'right' }] }]
    )
    document.body.append(one.element())
    assert.deepEqual(names(union), ['Two', 'One'])
    assert.deepEqual(names(union.last()), ['One'])
    const nested = page
      .getByRole('region', { name: 'Scope' })
      .getByRole('button')
    assert.deepEqual(names(nested.and(one)), [])
    assert.deepEqual(names(nested.and(two)), ['Two'])
    one.element().remove()
    assert.deepEqual(names(union), ['Two'])
    binding.dispose()
    await assert.rejects(union.click(), /transport has closed/)
    scope.close()
    assert.throws(() => union.elements(), /scope/)
    process.stdout.write(
      JSON.stringify({
        intersection: true,
        orderedUnion: true,
        deduplicated: true,
        liveQueries: true,
        nativeOptionsRetained: true,
        strictMultipleMatches: true,
        closedTransportRefused: true,
        closedScopeRefused: true,
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
    restoreBrowserDomRealm()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
