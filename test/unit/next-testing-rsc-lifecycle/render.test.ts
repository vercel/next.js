import { renderServerComponent } from 'next/dist/experimental/testing/rsc/render'

// These controlled streams test ownership and cancellation only. Real React,
// compilation, and serialization are validated by the integrated RSC suite.
function setup(options: { signal?: AbortSignal; cancelError?: Error } = {}) {
  let source!: ReadableStreamDefaultController<Uint8Array>
  let renderOptions!: {
    signal: AbortSignal
    onError(error: unknown): void
  }
  const cancel = jest.fn(() => {
    if (options.cancelError) throw options.cancelError
  })
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      source = controller
    },
    cancel,
  })
  const Component = () => null
  const element = {} as ReturnType<
    Parameters<typeof renderServerComponent>[0]['createElement']
  >
  const createElement = jest.fn(() => element)
  const renderToReadableStream = jest.fn((_element, _manifest, opts) => {
    renderOptions = opts
    return stream
  })
  const manifest = { clientModules: {} } as Parameters<
    typeof renderServerComponent
  >[1]
  const render = renderServerComponent(
    {
      createElement: createElement as unknown as Parameters<
        typeof renderServerComponent
      >[0]['createElement'],
      renderToReadableStream,
    },
    manifest,
    Component,
    {},
    { signal: options.signal }
  )
  return {
    render,
    source,
    cancel,
    createElement,
    renderToReadableStream,
    renderOptions: renderOptions!,
    manifest,
    Component,
    element,
  }
}

it('passes the bundle-created element and original manifest to Flight', async () => {
  const fixture = setup()
  expect(fixture.createElement).toHaveBeenCalledWith(fixture.Component, {})
  expect(fixture.renderToReadableStream).toHaveBeenCalledWith(
    fixture.element,
    fixture.manifest.clientModules,
    fixture.renderOptions
  )
  const chunk = new Uint8Array([1, 2, 3])
  fixture.source.enqueue(chunk)
  fixture.source.close()
  const reader = fixture.render.stream.getReader()
  expect(await reader.read()).toEqual({ done: false, value: chunk })
  expect(await reader.read()).toEqual({ done: true, value: undefined })
  expect(await fixture.render.completed).toEqual({
    status: 'completed',
    errors: [],
  })
  await fixture.render.dispose()
  expect(fixture.cancel).not.toHaveBeenCalled()
})

it('retains renderer errors even when Flight closes successfully', async () => {
  const fixture = setup()
  const error = new Error('nested async component rejected')
  fixture.renderOptions!.onError!(error)
  fixture.source.close()
  await fixture.render.stream.getReader().read()
  expect(await fixture.render.completed).toEqual({
    status: 'errored',
    errors: [error],
  })
})

it('retains transport errors and rejects stream consumption', async () => {
  const fixture = setup()
  const error = new Error('transport failed')
  fixture.source.error(error)
  await expect(fixture.render.stream.getReader().read()).rejects.toBe(error)
  expect(await fixture.render.completed).toEqual({
    status: 'errored',
    errors: [error],
  })
})

it('disposes a pending render once and rejects pending reads', async () => {
  const fixture = setup()
  const reason = new Error('attempt finished')
  const read = fixture.render.stream.getReader().read()
  const disposal = fixture.render.dispose(reason)
  expect(fixture.render.dispose(reason)).toBe(disposal)
  await expect(read).rejects.toBe(reason)
  await disposal
  expect(fixture.cancel).toHaveBeenCalledTimes(1)
  expect(fixture.cancel).toHaveBeenCalledWith(reason)
  expect(fixture.renderOptions!.signal!.reason).toBe(reason)
  expect(await fixture.render.completed).toEqual({
    status: 'aborted',
    errors: [],
  })
})

it('cancels on attempt abort even without a stream consumer', async () => {
  const controller = new AbortController()
  const fixture = setup({ signal: controller.signal })
  const reason = new Error('timeout')
  controller.abort(reason)
  expect(await fixture.render.completed).toEqual({
    status: 'aborted',
    errors: [],
  })
  await expect(fixture.render.stream.getReader().read()).rejects.toBe(reason)
  expect(fixture.cancel).toHaveBeenCalledTimes(1)
})

it('propagates consumer cancellation to the renderer', async () => {
  const fixture = setup()
  await fixture.render.stream.cancel('decoder stopped')
  expect(fixture.renderOptions!.signal!.reason).toBe('decoder stopped')
  expect(await fixture.render.completed).toEqual({
    status: 'aborted',
    errors: [],
  })
})

it('reports cleanup failures and still settles completion', async () => {
  const error = new Error('cancellation failed')
  const fixture = setup({ cancelError: error })
  await expect(fixture.render.dispose()).rejects.toBe(error)
  expect(await fixture.render.completed).toEqual({
    status: 'aborted',
    errors: [error],
  })
})

it('does not enter the renderer for an already aborted attempt', () => {
  const controller = new AbortController()
  controller.abort(new Error('already stopped'))
  expect(() => setup({ signal: controller.signal })).toThrow('already stopped')
})
