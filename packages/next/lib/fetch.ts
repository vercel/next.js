import unfetch from 'unfetch'

export type RetryOptions = {
  retries?: number
  factor?: number
  minTimeout?: number,
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retry(
  cb: (bail: () => {}, attempt: number) => Promise<Response>,
  opts: RetryOptions,
  attempt: number = 0,
): Promise<Response> {
  const retries = opts.retries || 5
  const factor = opts.factor || 2
  const minTimeout = opts.minTimeout || 1000

  let aborted = false

  const bail = (err?: Error) => {
    aborted = true
    throw err || new Error('Aborted')
  }

  try {
    return await cb(bail, attempt)
  } catch (e) {
    if (aborted || attempt >= retries) throw e

    await sleep(minTimeout * Math.pow(factor, attempt))

    return retry(cb, opts, attempt + 1)
  }
}

export function fetchRetry(fetch: GlobalFetch['fetch']) {
  const fn = (url: RequestInfo, opts: RequestInit & { retry?: RetryOptions } = {}) => {
    const retryOpts: RetryOptions = Object.assign({
      // timeouts will be [ 10, 50, 250 ]
      minTimeout: 10,
      retries: 3,
      factor: 5,
    }, opts.retry)

    return retry(async (_bail, attempt) => {
      const res = await fetch(url, opts);
      const isRetry = attempt < (retryOpts.retries || 0)

      // only retry if the request is GET or HEAD
      if (opts.method && !/(get|head)$/i.test(opts.method)) {
        return res
      }

      if (res.status >= 500 && res.status < 600 && isRetry) {
        const err = new Error(res.statusText)
        throw err
        // err.code = err.status = err.statusCode = res.status
      }

      return res
    }, retryOpts)
  }
  return fn
}

export default fetchRetry(unfetch)
