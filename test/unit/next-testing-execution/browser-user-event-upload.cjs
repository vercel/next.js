const assert = require('node:assert/strict')
const { JSDOM } = require('jsdom')
const client = require('next/dist/experimental/testing/client/async-context')
const {
  page,
  userEvent,
  initializeBrowserContext,
} = require('next/dist/experimental/testing/client/browser-context')

async function main() {
  const dom = new JSDOM(
    '<!DOCTYPE html><input type="file" aria-label="Upload">'
  )
  const values = {
    document: dom.window.document,
    Element: dom.window.Element,
    FileReader: dom.window.FileReader,
  }
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
      context: { id: 'upload', fileId: 'file', testId: 'case' },
    },
    (error) => {
      throw error
    }
  )
  const leave = client.enterCreatorScope(
    scope.run(() => client.captureCreatorScope())
  )
  const commands = []
  const originalError = new Error('native upload failed')
  let rejectNext = false
  const binding = initializeBrowserContext(async (command) => {
    if (rejectNext) {
      rejectNext = false
      throw originalError
    }
    commands.push(command)
  })
  try {
    const input = document.querySelector('input')
    const file = new dom.window.File(
      [new Uint8Array([0, 255, 1, 128, 65])],
      'binary.dat',
      { type: 'application/octet-stream' }
    )
    let syntheticEvents = 0
    input.addEventListener('change', () => syntheticEvents++)
    const upload = userEvent.upload
    const returns = [
      await upload(input, file, { timeout: 20 }),
      await page.getByLabelText('Upload').upload([file]),
      await upload(input, 'project.txt'),
      await upload(input, []),
    ]
    assert(returns.every((value) => value === undefined))
    assert.equal(input.files.length, 0)
    assert.equal(syntheticEvents, 0)
    const payload = {
      name: 'binary.dat',
      mimeType: 'application/octet-stream',
      base64: 'AP8BgEE=',
    }
    assert.deepEqual(
      commands.map(({ method, args }) => ({ method, args })),
      [
        { method: 'upload', args: [[payload], { timeout: 20 }] },
        { method: 'upload', args: [[payload]] },
        { method: 'upload', args: [['project.txt']] },
        { method: 'upload', args: [[]] },
      ]
    )
    assert.equal(new Set(commands.map((command) => command.element)).size, 1)
    rejectNext = true
    await assert.rejects(
      upload(input, file),
      (error) => error === originalError
    )
    input.remove()
    await assert.rejects(upload(input, file), /not attached/)
    document.body.append(input)
    binding.dispose()
    await assert.rejects(upload(input, file), /transport has closed/)
    scope.close()
    assert.throws(() => upload(input, file), /scope/)
    process.stdout.write(
      JSON.stringify({
        commands,
        allUndefined: true,
        exactBinaryBytes: true,
        noSyntheticEvents: true,
        originalErrorRetained: true,
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
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
