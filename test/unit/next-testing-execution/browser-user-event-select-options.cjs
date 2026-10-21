const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const providerRequire = createRequire(require.resolve('jest-environment-jsdom'))
const { JSDOM } = require(providerRequire.resolve('jsdom'))
const client = require('next/dist/experimental/testing/client/async-context')
const {
  userEvent,
  page,
  initializeBrowserContext,
} = require('next/dist/experimental/testing/client/browser-context')
;(async () => {
  const dom = new JSDOM(
    '<!DOCTYPE html><select aria-label="choices" multiple><option value="same">Alpha</option><option value="same">Beta</option><option value="third">Gamma</option></select>'
  )
  const saved = new Map(
    ['document', 'Element', 'HTMLElement'].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ])
  )
  for (const key of saved.keys())
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: key === 'document' ? dom.window.document : dom.window[key],
    })
  const scope = client.createAsyncScope(
    {
      kind: 'attempt',
      context: { id: 'options', fileId: 'file', testId: 'case' },
    },
    (error) => {
      throw error
    }
  )
  const leave = client.enterCreatorScope(
    scope.run(() => client.captureCreatorScope())
  )
  const commands = [],
    nativeError = new Error('native option action failed')
  let rejectNext = false
  const binding = initializeBrowserContext(async (command) => {
    if (rejectNext) {
      rejectNext = false
      throw nativeError
    }
    commands.push(command)
  })
  try {
    const element = document.querySelector('select'),
      options = [...element.options],
      locator = page.getByLabelText('choices'),
      beta = page.getByRole('option', { name: 'Beta' }),
      gamma = page.getByRole('option', { name: 'Gamma' })
    let synthetic = 0
    for (const type of ['input', 'change'])
      element.addEventListener(type, () => synthetic++)
    const results = [
      await userEvent.selectOptions(element, options[1]),
      await locator.selectOptions(beta, { timeout: 50 }),
      await userEvent.setup().selectOptions(locator, [options[0], options[2]]),
      await locator.selectOptions([beta, gamma]),
      await userEvent.selectOptions(element, ['same', 'third']),
      await locator.selectOptions([]),
    ]
    assert(results.every((value) => value === undefined))
    const ids = options.map((option) =>
        option.getAttribute('data-next-test-element')
      ),
      target = element.getAttribute('data-next-test-element')
    assert.deepEqual(
      commands.map((command) => command.args),
      [
        [[{ element: ids[1] }]],
        [[{ element: ids[1] }], { timeout: 50 }],
        [[{ element: ids[0] }, { element: ids[2] }]],
        [[{ element: ids[1] }, { element: ids[2] }]],
        [['same', 'third']],
        [[]],
      ]
    )
    assert(
      commands.every(
        (command) =>
          command.element === target && command.method === 'selectOptions'
      )
    )
    assert.equal(synthetic, 0)
    assert.equal(element.selectedOptions.length, 0)
    rejectNext = true
    await assert.rejects(
      userEvent.selectOptions(element, options[1]),
      (error) => error === nativeError
    )
    await userEvent.selectOptions(element, options[1])
    const before = commands.length
    options[1].remove()
    await assert.rejects(
      userEvent.selectOptions(element, options[1]),
      /not attached/
    )
    assert.equal(commands.length, before)
    binding.dispose()
    await assert.rejects(
      userEvent.selectOptions(element, options[0]),
      /transport has closed/
    )
    scope.close()
    await assert.rejects(
      async () => userEvent.selectOptions(element, options[0]),
      /scope/
    )
    process.stdout.write(
      JSON.stringify({
        commands,
        ids,
        target,
        allUndefined: true,
        noSyntheticEvents: true,
        originalNativeErrorRetained: true,
        recovered: true,
        detachedRefused: true,
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
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
