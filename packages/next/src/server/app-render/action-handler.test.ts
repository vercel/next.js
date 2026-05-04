import RenderResult from '../render-result'
import { executeRevalidates } from '../revalidation-utils'
import {
  executeRevalidatesOnRenderCompletion,
  parseHostHeader,
} from './action-handler'

jest.mock('../revalidation-utils', () => ({
  executeRevalidates: jest.fn(),
}))

const createDeferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((res) => {
    resolve = res
  })

  return { promise, resolve }
}

const createStreamRenderResult = (content: string): RenderResult => {
  const encoder = new TextEncoder()

  return new RenderResult(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(content))
        controller.close()
      },
    }),
    {
      contentType: null,
      metadata: {},
    }
  )
}

describe('executeRevalidatesOnRenderCompletion', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('waits for revalidations before completing the render stream', async () => {
    const workStore = {} as any
    const deferred = createDeferred()
    ;(executeRevalidates as jest.Mock).mockReturnValue(deferred.promise)

    const renderResult = executeRevalidatesOnRenderCompletion(
      createStreamRenderResult('flight'),
      workStore
    )

    let isResolved = false
    const result = renderResult.toUnchunkedString(true).then((value) => {
      isResolved = true
      return value
    })

    await expect(
      Promise.race([
        result,
        new Promise((resolve) => setTimeout(() => resolve('pending'), 10)),
      ])
    ).resolves.toBe('pending')

    expect(executeRevalidates).toHaveBeenCalledWith(workStore)
    expect(isResolved).toBe(false)

    deferred.resolve()

    await expect(result).resolves.toBe('flight')
    expect(isResolved).toBe(true)
  })
})

describe('parseHostHeader', () => {
  it('should return correct host', () => {
    expect(parseHostHeader({})).toBe(undefined)

    expect(
      parseHostHeader({
        host: 'www.foo.com',
      })
    ).toEqual({ type: 'host', value: 'www.foo.com' })

    expect(
      parseHostHeader({
        host: undefined,
        'x-forwarded-host': 'www.foo.com',
      })
    ).toEqual({ type: 'x-forwarded-host', value: 'www.foo.com' })

    expect(
      parseHostHeader({
        host: 'www.foo.com',
        'x-forwarded-host': undefined,
      })
    ).toEqual({ type: 'host', value: 'www.foo.com' })
  })

  it('should return x-forwarded-host over host header', () => {
    expect(
      parseHostHeader({
        host: 'www.foo.com',
        'x-forwarded-host': 'www.bar.com',
      })
    ).toEqual({ type: 'x-forwarded-host', value: 'www.bar.com' })
  })

  it('should return correct x-forwarded-host when provided in array', () => {
    expect(
      parseHostHeader({
        host: 'www.foo.com',
        'x-forwarded-host': ['www.bar.com', 'www.baz.com'],
      })
    ).toEqual({ type: 'x-forwarded-host', value: 'www.bar.com' })

    expect(
      parseHostHeader({
        host: 'www.foo.com',
        'x-forwarded-host': [],
      })
    ).toEqual({ type: 'host', value: 'www.foo.com' })

    expect(
      parseHostHeader({
        host: 'www.foo.com',
        'x-forwarded-host': 'www.bar.com, www.baz.com',
      })
    ).toEqual({ type: 'x-forwarded-host', value: 'www.bar.com' })
  })

  it('should return whichever matches provided origin', () => {
    expect(
      parseHostHeader(
        {
          host: 'www.foo.com',
          'x-forwarded-host': ['www.bar.com', 'www.baz.com'],
        },
        'www.foo.com'
      )
    ).toEqual({ type: 'host', value: 'www.foo.com' })

    expect(
      parseHostHeader(
        {
          host: 'www.foo.com',
          'x-forwarded-host': ['www.bar.com'],
        },
        'www.bar.com'
      )
    ).toEqual({ type: 'x-forwarded-host', value: 'www.bar.com' })

    expect(
      parseHostHeader(
        {
          host: 'www.foo.com',
          'x-forwarded-host': 'www.bar.com, www.baz.com',
        },
        'www.bar.com'
      )
    ).toEqual({ type: 'x-forwarded-host', value: 'www.bar.com' })
  })
})
