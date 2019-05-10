/* eslint-env jest */
import fetchRetry from 'next-server/dist/lib/fetch/retry'

const createFetchFn = (url, timeouts, resultFn) => {
  let attemps = 0

  const startTime = Date.now()
  const fetchFn = jest.fn((_url, opts) => {
    const time = Date.now() - startTime

    expect(time >= timeouts[attemps++]).toBeTruthy()
    expect(url).toBe(_url)

    return typeof resultFn === 'function' ? resultFn(attemps - 1) : resultFn
  })

  return fetchFn
}

describe('fetch', () => {
  it('Should properly call fetch', async () => {
    const fetchFn = jest.fn((url, opts) => {
      return { status: 200 }
    })
    const fetch = fetchRetry(fetchFn)

    expect((await fetch('test')).status).toBe(200)
    expect((await fetch('test', { method: 'get' })).status).toBe(200)
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(fetchFn).toHaveBeenNthCalledWith(1, 'test', {})
    expect(fetchFn).toHaveBeenNthCalledWith(2, 'test', { method: 'get' })
  })

  it('Should retry the fetch with the default options', async () => {
    const timeouts = [0, 10, 50, 250]
    const fetchFn = createFetchFn('test', timeouts, { status: 500, statusText: 'error' })
    const fetch = fetchRetry(fetchFn)

    // await expect(fetch('test')).rejects.toEqual(new Error('error'))
    expect(await fetch('test')).toEqual({ status: 500, statusText: 'error' })
    expect(fetchFn).toHaveBeenCalledTimes(4)
  })

  it('Should retry the fetch with custom options', async () => {
    const opts = {
      retry: {
        minTimeout: 20,
        retries: 5,
        factor: 2
      }
    }
    const timeouts = [0, 20, 40, 80, 160, 320]
    const fetchFn = createFetchFn('test', timeouts, { status: 500, statusText: 'error' })
    const fetch = fetchRetry(fetchFn)

    expect(await fetch('test', opts)).toEqual({ status: 500, statusText: 'error' })
    expect(fetchFn).toHaveBeenCalledTimes(6)
  })

  it('Should stop retrying after a successful response', async () => {
    const timeouts = [0, 10, 50]
    const resultFn = (attemps) => (
      // Make if work in the second attempt
      attemps < 2 ? { status: 500, statusText: 'error' } : { status: 200 }
    )
    const fetchFn = createFetchFn('test', timeouts, resultFn)
    const fetch = fetchRetry(fetchFn)

    expect((await fetch('test')).status).toBe(200)
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  it('Should stop retrying after a successful response with custom options', async () => {
    const opts = {
      retry: {
        minTimeout: 20,
        retries: 10,
        factor: 2
      }
    }
    const timeouts = [0, 20, 40, 80, 160]
    const resultFn = (attemps) => (
      // Make if work in the four attempt
      attemps < 4 ? { status: 500, statusText: 'error' } : { status: 200 }
    )
    const fetchFn = createFetchFn('test', timeouts, resultFn)
    const fetch = fetchRetry(fetchFn)

    expect((await fetch('test', opts)).status).toBe(200)
    expect(fetchFn).toHaveBeenCalledTimes(5)
  })
})
