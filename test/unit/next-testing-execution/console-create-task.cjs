const assert = require('node:assert/strict')
const { Console } = require('node:console')
const path = require('node:path')
const { createRequire } = require('node:module')
async function run(load, mode) {
  const { installTestConsole } = load(
    'next/dist/experimental/testing/execution/console'
  )
  const before = Object.getOwnPropertyDescriptor(globalThis, 'console')
  const host = globalThis.console
  const hostTask = Object.getOwnPropertyDescriptor(host, 'createTask')
  assert.equal(
    typeof hostTask.value,
    'function',
    'real supported Node exposes its own inspector task'
  )
  if (mode === 'absent')
    Object.defineProperty(globalThis, 'console', {
      ...before,
      value: new Console(process.stdout, process.stderr),
    })
  else assert.equal(mode, 'actual')
  const selected = Object.getOwnPropertyDescriptor(globalThis, 'console')
  const actualTask = Object.getOwnPropertyDescriptor(
    selected.value,
    'createTask'
  )
  const rows = []
  let capture
  try {
    capture = installTestConsole({
      fileId: 'file',
      getTask: () => ({ taskId: 'real-task' }),
      publish: async (output) => {
        rows.push(output)
      },
    })
    assert.deepEqual(
      Object.getOwnPropertyDescriptor(globalThis.console, 'createTask'),
      actualTask
    )
    if (mode === 'actual') {
      assert.equal(globalThis.console.createTask, hostTask.value)
      const value = globalThis.console
        .createTask('actual captured inspector task')
        .run(() => {
          console.log('actual inspector callback')
          return 42
        })
      assert.equal(value, 42)
    } else {
      assert.equal(globalThis.console.createTask, undefined)
      console.log('actual absent task host')
    }
    await capture.flush()
    assert.equal(rows.length, 1)
    assert.equal(rows[0].console.taskId, 'real-task')
    assert.equal(
      rows[0].text,
      mode === 'actual'
        ? 'actual inspector callback\n'
        : 'actual absent task host\n'
    )
    await capture.dispose()
    capture = undefined
    assert.deepEqual(
      Object.getOwnPropertyDescriptor(globalThis, 'console'),
      selected
    )
  } finally {
    await capture?.dispose()
    Object.defineProperty(globalThis, 'console', before)
  }
  assert.equal(globalThis.console, host)
  return {
    mode,
    actualNodeVersion: process.version,
    actualHostTaskPreserved: true,
    originalConsoleRestored: true,
    fakeTaskShim: false,
  }
}
module.exports = { run }
if (require.main === module)
  run(
    createRequire(path.join(path.resolve(process.argv[2]), 'package.json')),
    process.argv[3]
  )
    .then((value) => console.log(JSON.stringify(value)))
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
