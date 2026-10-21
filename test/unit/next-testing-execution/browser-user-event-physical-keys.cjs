const assert = require('node:assert/strict')
const {
  runClientKeyboard,
  cleanupClientKeyboard,
} = require('next/dist/experimental/testing/client/keyboard')

async function main() {
  const scenario = process.argv[2]
  const actions = []
  const keyboard = Object.fromEntries(
    ['down', 'up', 'insertText'].map((method) => [
      method,
      async (key) => actions.push([method, key]),
    ])
  )
  const selectAll = async () =>
    assert.fail('No selection shortcut was requested')
  if (scenario === 'preflight') {
    const held = Object.freeze(['Shift'])
    for (const text of [
      '[/ShiftRight]a[UnknownPhysicalCode]',
      '[/ShiftRight]a[KeyA>9007199254740992/]',
      '[/ShiftRight]a[KeyA',
    ]) {
      await assert.rejects(runClientKeyboard(keyboard, text, selectAll, held))
      assert.deepEqual(actions, [])
      assert.deepEqual(held, ['Shift'])
    }
    assert.deepEqual(
      await runClientKeyboard(keyboard, '[/ShiftRight][KeyA]', selectAll, held),
      { unreleased: [] }
    )
    assert.deepEqual(actions, [
      ['up', 'Shift'],
      ['down', 'a'],
      ['up', 'a'],
    ])
  } else if (scenario === 'native-error') {
    const failure = new Error('actual native keyboard rejection')
    let reject
    const pending = new Promise((_, no) => (reject = no))
    keyboard.down = async (key) => {
      actions.push(['down', key])
      if (key === 'a') await pending
    }
    const running = runClientKeyboard(keyboard, '[KeyA][KeyB]', selectAll)
    const retained = assert.rejects(running, (error) => error === failure)
    assert.deepEqual(actions, [['down', 'a']])
    reject(failure)
    await retained
    assert.deepEqual(actions, [['down', 'a']])
    assert.deepEqual(await runClientKeyboard(keyboard, '[KeyB]', selectAll), {
      unreleased: [],
    })
    assert.deepEqual(actions.slice(1), [
      ['down', 'b'],
      ['up', 'b'],
    ])
  } else if (scenario === 'held-state') {
    const held = await runClientKeyboard(keyboard, '[ShiftRight>]', selectAll)
    assert.deepEqual(held, { unreleased: ['Shift'] })
    const named = await runClientKeyboard(
      keyboard,
      '{Shift>2/}',
      selectAll,
      held.unreleased
    )
    assert.deepEqual(named, { unreleased: [] })
    assert.deepEqual(actions, [
      ['down', 'Shift'],
      ['up', 'Shift'],
      ['down', 'Shift'],
      ['down', 'Shift'],
      ['up', 'Shift'],
    ])
    actions.length = 0
    const reheld = await runClientKeyboard(keyboard, '{Shift>}', selectAll)
    assert.deepEqual(
      await runClientKeyboard(
        keyboard,
        '[/ShiftLeft][KeyA>2]',
        selectAll,
        reheld.unreleased
      ),
      { unreleased: ['a'] }
    )
    await cleanupClientKeyboard(keyboard, ['a'])
    assert.deepEqual(actions, [
      ['down', 'Shift'],
      ['up', 'Shift'],
      ['down', 'a'],
      ['down', 'a'],
      ['up', 'a'],
    ])
  } else assert.fail('Unknown physical keyboard control')
  console.log(JSON.stringify({ scenario, originalNativeOwnership: true }))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
