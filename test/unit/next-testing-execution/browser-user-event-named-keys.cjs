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
  const selectAll = async () => assert.fail('Unexpected selection shortcut')
  if (scenario === 'preflight') {
    const held = Object.freeze(['ContextMenu'])
    for (const descriptor of [
      '{/ContextMenu}[PageUp][UnknownPhysicalCode]',
      '{/ContextMenu}{CapsLock>9007199254740992/}',
      '{/ContextMenu}[PageDown',
    ]) {
      await assert.rejects(
        runClientKeyboard(keyboard, descriptor, selectAll, held)
      )
      assert.deepEqual(actions, [])
      assert.deepEqual(held, ['ContextMenu'])
    }
    assert.deepEqual(
      await runClientKeyboard(
        keyboard,
        '[/ContextMenu]{PageDown}',
        selectAll,
        held
      ),
      { unreleased: [] }
    )
    assert.deepEqual(actions, [
      ['up', 'ContextMenu'],
      ['down', 'PageDown'],
      ['up', 'PageDown'],
    ])
  } else if (scenario === 'native-error') {
    const failure = new Error('actual ContextMenu native rejection')
    let reject
    const pending = new Promise((_, no) => (reject = no))
    keyboard.down = async (key) => {
      actions.push(['down', key])
      if (key === 'ContextMenu') await pending
    }
    const running = runClientKeyboard(
      keyboard,
      '[ContextMenu]{PageUp}',
      selectAll
    )
    const retained = assert.rejects(running, (error) => error === failure)
    assert.deepEqual(actions, [['down', 'ContextMenu']])
    reject(failure)
    await retained
    assert.deepEqual(actions, [['down', 'ContextMenu']])
    await runClientKeyboard(keyboard, '{PageUp}', selectAll)
    assert.deepEqual(actions.slice(1), [
      ['down', 'PageUp'],
      ['up', 'PageUp'],
    ])
  } else if (scenario === 'cleanup-error') {
    const failure = new Error('actual held key release rejection')
    const held = await runClientKeyboard(
      keyboard,
      '[CapsLock>]{PageUp>}[PageDown>]{ContextMenu>}',
      selectAll
    )
    assert.deepEqual(held.unreleased, [
      'CapsLock',
      'PageUp',
      'PageDown',
      'ContextMenu',
    ])
    actions.length = 0
    keyboard.up = async (key) => {
      actions.push(['up', key])
      if (key === 'PageUp') throw failure
    }
    await assert.rejects(
      cleanupClientKeyboard(keyboard, held.unreleased),
      (error) => error === failure
    )
    assert.deepEqual(actions, [
      ['up', 'CapsLock'],
      ['up', 'PageUp'],
    ])
    keyboard.up = async (key) => actions.push(['up', key])
    await cleanupClientKeyboard(keyboard, ['PageUp', 'PageDown', 'ContextMenu'])
    assert.deepEqual(actions.slice(2), [
      ['up', 'PageUp'],
      ['up', 'PageDown'],
      ['up', 'ContextMenu'],
    ])
  } else assert.fail('Unknown named keyboard control')
  console.log(JSON.stringify({ scenario, existingNativeOwnership: true }))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
