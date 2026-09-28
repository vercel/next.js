/* eslint-env jest */
/**
 * @jest-environment node
 */
import RenderResult, {
  type RenderResultResponse,
} from 'next/dist/server/render-result'

const encode = (value: string) => new TextEncoder().encode(value)

function makeResult(response: RenderResultResponse) {
  return new RenderResult(response, { contentType: null, metadata: {} })
}

async function readOutput(
  result: ReturnType<typeof makeResult>,
  onWrite?: () => void
) {
  const chunks: Uint8Array[] = []
  await result.pipeTo(
    new WritableStream<Uint8Array>({
      write(chunk) {
        chunks.push(chunk)
        onWrite?.()
      },
    })
  )
  return Buffer.concat(chunks).toString('utf8')
}

describe('RenderResult output completion', () => {
  it.each([
    ['string', 'body', false, false, 'body'],
    ['buffer', Buffer.from('body'), false, true, 'body'],
    ['null', null, true, true, ''],
  ] as const)(
    'settles a %s body immediately without changing its representation',
    async (_kind, body, isNull, isDynamic, output) => {
      const result = makeResult(body)
      const onSettled = jest.fn()

      result.onOutputSettled(onSettled)

      expect(onSettled).toHaveBeenCalledTimes(1)
      expect(onSettled).toHaveBeenCalledWith(true)
      expect(result.isNull).toBe(isNull)
      expect(result.isDynamic).toBe(isDynamic)
      expect(await readOutput(result)).toBe(output)
    }
  )

  it('settles a Web stream only after its bytes are consumed', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const source = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value
      },
    })
    const result = makeResult(source)
    const onSettled = jest.fn()
    result.onOutputSettled(onSettled)

    let firstWrite!: () => void
    const wrote = new Promise<void>((resolve) => {
      firstWrite = resolve
    })
    const output = readOutput(result, firstWrite)
    controller.enqueue(encode('web'))
    await wrote
    expect(onSettled).not.toHaveBeenCalled()
    controller.close()

    expect(await output).toBe('web')
    expect(onSettled).toHaveBeenCalledTimes(1)
    expect(onSettled).toHaveBeenCalledWith(true)
  })

  it('waits for every stream in an array', async () => {
    let lastController!: ReadableStreamDefaultController<Uint8Array>
    const first = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encode('first '))
        controller.close()
      },
    })
    const last = new ReadableStream<Uint8Array>({
      start(controller) {
        lastController = controller
      },
    })
    const result = makeResult([first, last])
    const onSettled = jest.fn()
    result.onOutputSettled(onSettled)

    let firstWrite!: () => void
    const wrote = new Promise<void>((resolve) => {
      firstWrite = resolve
    })
    const output = readOutput(result, firstWrite)
    await wrote
    expect(onSettled).not.toHaveBeenCalled()
    lastController.enqueue(encode('last'))
    lastController.close()

    expect(await output).toBe('first last')
    expect(onSettled).toHaveBeenCalledTimes(1)
    expect(onSettled).toHaveBeenCalledWith(true)
  })

  it('reports a source error without changing the propagated error', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const source = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value
      },
    })
    const result = makeResult(source)
    const onSettled = jest.fn()
    result.onOutputSettled(onSettled)

    const output = readOutput(result)
    const error = new Error('source failed')
    controller.error(error)

    await expect(output).rejects.toBe(error)
    expect(onSettled).toHaveBeenCalledTimes(1)
    expect(onSettled).toHaveBeenCalledWith(false)
  })

  it('reports consumer cancellation once', async () => {
    const onCancel = jest.fn()
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encode('stop'))
      },
      cancel: onCancel,
    })
    const result = makeResult(source)
    const onSettled = jest.fn()
    result.onOutputSettled(onSettled)
    const error = new Error('consumer stopped')

    await expect(
      result.pipeTo(
        new WritableStream<Uint8Array>({
          write() {
            throw error
          },
        })
      )
    ).rejects.toBe(error)

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledWith(error)
    expect(onSettled).toHaveBeenCalledTimes(1)
    expect(onSettled).toHaveBeenCalledWith(false)
  })

  it('isolates throwing observers and notifies later observers once', async () => {
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encode('body'))
        controller.close()
      },
    })
    const result = makeResult(source)
    const first = jest.fn(() => {
      throw new Error('observer failed')
    })
    const second = jest.fn()
    result.onOutputSettled(first)
    result.onOutputSettled(second)

    expect(await readOutput(result)).toBe('body')
    expect(first).toHaveBeenCalledTimes(1)
    expect(first).toHaveBeenCalledWith(true)
    expect(second).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledWith(true)

    expect(() => makeResult('static').onOutputSettled(first)).not.toThrow()
  })

  it('settles output before an unrelated waitUntil completes', async () => {
    let releaseWaitUntil!: () => void
    const waitUntil = new Promise<void>((resolve) => {
      releaseWaitUntil = resolve
    })
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encode('body'))
        controller.close()
      },
    })
    const result = new RenderResult(source, {
      contentType: null,
      metadata: {},
      waitUntil,
    })
    let reportCompletion!: (completed: boolean) => void
    const settled = new Promise<boolean>((resolve) => {
      reportCompletion = resolve
    })
    result.onOutputSettled(reportCompletion)

    let pipeFinished = false
    const piped = readOutput(result).then((output) => {
      pipeFinished = true
      return output
    })
    expect(await settled).toBe(true)
    expect(pipeFinished).toBe(false)

    releaseWaitUntil()
    expect(await piped).toBe('body')
  })

  it('observes only the body present at registration', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encode('body'))
        controller.close()
      },
    })
    let tailController!: ReadableStreamDefaultController<Uint8Array>
    const tail = new ReadableStream<Uint8Array>({
      start(controller) {
        tailController = controller
      },
    })
    const prefix = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encode('prefix '))
        controller.close()
      },
    })
    const result = makeResult(body)
    let settle!: (completed: boolean) => void
    const settled = new Promise<boolean>((resolve) => {
      settle = resolve
    })
    result.onOutputSettled(settle)
    result.unshift(prefix)
    result.push(tail)

    const output = readOutput(result)
    expect(await settled).toBe(true)
    tailController.enqueue(encode(' tail'))
    tailController.close()
    expect(await output).toBe('prefix body tail')
  })
})
