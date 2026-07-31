import type { IncomingMessage, ServerResponse } from 'http'
import * as fsPromises from 'fs/promises'
import { mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  devToolsConfigMiddleware,
  getDevToolsConfig,
} from 'next/dist/next-devtools/server/devtools-config-middleware'

jest.mock('fs/promises', () => {
  const actual = jest.requireActual('fs/promises')
  return {
    ...actual,
    rename: jest.fn(actual.rename),
    writeFile: jest.fn(actual.writeFile),
  }
})

function createDeferred() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function createRequest(
  body: object,
  {
    bodyRequested,
    bodyConsumed,
    releaseBody,
  }: {
    bodyRequested?: ReturnType<typeof createDeferred>
    bodyConsumed?: ReturnType<typeof createDeferred>
    releaseBody?: Promise<void>
  } = {}
): IncomingMessage {
  return {
    method: 'POST',
    url: '/__nextjs_devtools_config',
    async *[Symbol.asyncIterator]() {
      bodyRequested?.resolve()
      await releaseBody
      yield Buffer.from(JSON.stringify(body))
      bodyConsumed?.resolve()
    },
  } as IncomingMessage
}

function createResponse(): ServerResponse {
  return {
    end: jest.fn(),
    setHeader: jest.fn(),
  } as unknown as ServerResponse
}

function createChunkedRequest(chunks: Buffer[]): IncomingMessage {
  return {
    method: 'POST',
    url: '/__nextjs_devtools_config',
    async *[Symbol.asyncIterator]() {
      yield* chunks
    },
  } as IncomingMessage
}

describe('DevTools config middleware', () => {
  let distDir: string

  beforeEach(async () => {
    distDir = await mkdtemp(join(tmpdir(), 'next-devtools-config-'))
  })

  afterEach(async () => {
    await rm(distDir, { recursive: true, force: true })
  })

  it('commits concurrent patches in request arrival order', async () => {
    const sendUpdateSignal = jest.fn()
    const middleware = devToolsConfigMiddleware({
      distDir,
      sendUpdateSignal,
    })
    const bodyRequested = createDeferred()
    const releaseFirstBody = createDeferred()
    const firstResponse = createResponse()
    const secondResponse = createResponse()

    const firstRequest = middleware(
      createRequest(
        { requestInsights: { showInternal: true, verbose: false } },
        {
          bodyRequested,
          releaseBody: releaseFirstBody.promise,
        }
      ),
      firstResponse,
      jest.fn()
    )

    await bodyRequested.promise
    const secondBodyConsumed = createDeferred()
    const secondRequest = middleware(
      createRequest(
        { requestInsights: { verbose: true } },
        { bodyConsumed: secondBodyConsumed }
      ),
      secondResponse,
      jest.fn()
    )

    await secondBodyConsumed.promise
    releaseFirstBody.resolve()
    await Promise.all([firstRequest, secondRequest])

    const config = JSON.parse(
      await readFile(
        join(distDir, 'cache', 'next-devtools-config.json'),
        'utf8'
      )
    )
    expect(config).toEqual({
      requestInsights: {
        showInternal: true,
        verbose: true,
      },
    })
    expect(firstResponse.statusCode).toBe(204)
    expect(secondResponse.statusCode).toBe(204)
    expect(sendUpdateSignal).toHaveBeenLastCalledWith(config)
  })

  it('keeps a queue reservation after an invalid request finishes early', async () => {
    const middleware = devToolsConfigMiddleware({
      distDir,
      sendUpdateSignal: jest.fn(),
    })
    const firstBodyRequested = createDeferred()
    const releaseFirstBody = createDeferred()
    const firstRequest = middleware(
      createRequest(
        { requestInsights: { verbose: false } },
        {
          bodyRequested: firstBodyRequested,
          releaseBody: releaseFirstBody.promise,
        }
      ),
      createResponse(),
      jest.fn()
    )

    await firstBodyRequested.promise
    const invalidResponse = createResponse()
    await middleware(
      createChunkedRequest([Buffer.alloc(64 * 1024, 'x'), Buffer.from('x')]),
      invalidResponse,
      jest.fn()
    )
    expect(invalidResponse.statusCode).toBe(413)

    const thirdBodyConsumed = createDeferred()
    const thirdRequest = middleware(
      createRequest(
        { requestInsights: { verbose: true } },
        { bodyConsumed: thirdBodyConsumed }
      ),
      createResponse(),
      jest.fn()
    )

    await thirdBodyConsumed.promise
    releaseFirstBody.resolve()
    await Promise.all([firstRequest, thirdRequest])

    await expect(getDevToolsConfig(distDir)).resolves.toEqual({
      requestInsights: { verbose: true },
    })
  })

  it('keeps the previous config readable until an update is complete', async () => {
    const middleware = devToolsConfigMiddleware({
      distDir,
      sendUpdateSignal: jest.fn(),
    })
    await middleware(
      createRequest({ requestInsights: { showInternal: true } }),
      createResponse(),
      jest.fn()
    )

    const writeStarted = createDeferred()
    const releaseWrite = createDeferred()
    const { writeFile } =
      jest.requireActual<typeof import('fs/promises')>('fs/promises')
    const writeFileMock = jest.mocked(fsPromises.writeFile)
    writeFileMock.mockImplementation(async (path, contents, options) => {
      const serialized = String(contents)
      if (serialized.includes('"verbose": true')) {
        await writeFile(path, serialized.slice(0, serialized.length / 2))
        writeStarted.resolve()
        await releaseWrite.promise
      }
      return writeFile(path, contents, options)
    })

    try {
      const update = middleware(
        createRequest({ requestInsights: { verbose: true } }),
        createResponse(),
        jest.fn()
      )
      await writeStarted.promise

      await expect(getDevToolsConfig(distDir)).resolves.toEqual({
        requestInsights: { showInternal: true },
      })

      releaseWrite.resolve()
      await update
      await expect(getDevToolsConfig(distDir)).resolves.toEqual({
        requestInsights: {
          showInternal: true,
          verbose: true,
        },
      })
    } finally {
      releaseWrite.resolve()
      writeFileMock.mockImplementation(writeFile)
      writeFileMock.mockClear()
    }
  })

  it('does not let a missing-file read overwrite the first update', async () => {
    const writeFile = jest.mocked(fsPromises.writeFile)
    writeFile.mockClear()

    await expect(getDevToolsConfig(distDir)).resolves.toEqual({})
    expect(writeFile).not.toHaveBeenCalled()

    const middleware = devToolsConfigMiddleware({
      distDir,
      sendUpdateSignal: jest.fn(),
    })
    await middleware(
      createRequest({ requestInsights: { showInternal: true } }),
      createResponse(),
      jest.fn()
    )

    await expect(getDevToolsConfig(distDir)).resolves.toEqual({
      requestInsights: { showInternal: true },
    })
  })

  it('recovers from a corrupted config file on the next update', async () => {
    const configPath = join(distDir, 'cache', 'next-devtools-config.json')
    await fsPromises.mkdir(join(distDir, 'cache'), { recursive: true })
    await fsPromises.writeFile(configPath, '{not valid JSON')

    await expect(getDevToolsConfig(distDir)).resolves.toEqual({})

    const middleware = devToolsConfigMiddleware({
      distDir,
      sendUpdateSignal: jest.fn(),
    })
    await middleware(
      createRequest({ requestInsights: { showInternal: true } }),
      createResponse(),
      jest.fn()
    )

    await expect(getDevToolsConfig(distDir)).resolves.toEqual({
      requestInsights: { showInternal: true },
    })
  })

  it('recovers from a schema-invalid config file on the next update', async () => {
    const configPath = join(distDir, 'cache', 'next-devtools-config.json')
    await fsPromises.mkdir(join(distDir, 'cache'), { recursive: true })
    await fsPromises.writeFile(configPath, JSON.stringify({ theme: 123 }))

    await expect(getDevToolsConfig(distDir)).resolves.toEqual({})

    const middleware = devToolsConfigMiddleware({
      distDir,
      sendUpdateSignal: jest.fn(),
    })
    await middleware(
      createRequest({ requestInsights: { showInternal: true } }),
      createResponse(),
      jest.fn()
    )

    await expect(getDevToolsConfig(distDir)).resolves.toEqual({
      requestInsights: { showInternal: true },
    })
  })

  it('keeps the previous config and releases the queue after a failed rename', async () => {
    const sendUpdateSignal = jest.fn()
    const middleware = devToolsConfigMiddleware({
      distDir,
      sendUpdateSignal,
    })
    await middleware(
      createRequest({ requestInsights: { showInternal: true } }),
      createResponse(),
      jest.fn()
    )
    sendUpdateSignal.mockClear()

    jest
      .mocked(fsPromises.rename)
      .mockRejectedValueOnce(new Error('rename failed'))

    await expect(
      middleware(
        createRequest({ requestInsights: { verbose: true } }),
        createResponse(),
        jest.fn()
      )
    ).rejects.toThrow('rename failed')

    await expect(getDevToolsConfig(distDir)).resolves.toEqual({
      requestInsights: { showInternal: true },
    })
    expect(sendUpdateSignal).not.toHaveBeenCalled()
    await expect(fsPromises.readdir(join(distDir, 'cache'))).resolves.toEqual([
      'next-devtools-config.json',
    ])

    await middleware(
      createRequest({ requestInsights: { verbose: true } }),
      createResponse(),
      jest.fn()
    )
    await expect(getDevToolsConfig(distDir)).resolves.toEqual({
      requestInsights: { showInternal: true, verbose: true },
    })
  })

  it('rejects config request bodies larger than 64 KiB', async () => {
    const sendUpdateSignal = jest.fn()
    const middleware = devToolsConfigMiddleware({
      distDir,
      sendUpdateSignal,
    })
    const response = createResponse()

    await middleware(
      createChunkedRequest([Buffer.alloc(64 * 1024, 'x'), Buffer.from('x')]),
      response,
      jest.fn()
    )

    expect(response.statusCode).toBe(413)
    expect(response.end).toHaveBeenCalledWith('Payload Too Large')
    expect(sendUpdateSignal).not.toHaveBeenCalled()
    await expect(getDevToolsConfig(distDir)).resolves.toEqual({})
  })
})
