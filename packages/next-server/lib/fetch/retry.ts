export type RetryOptions = {
  retries?: number
  factor?: number
  minTimeout?: number
  onRetry?(err: Error, attempt: number): void,
}

export class FetchError extends Error {
  readonly statusCode: number
  readonly status: number
  readonly code: number
  readonly url: string

  constructor(message: string, { status, url }: { status: number, url: string }) {
    super(message)

    this.code = this.status = this.statusCode = status
    this.url = url
  }
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retry<R = void>(
  cb: (bail: (err?: Error) => never, attempt: number) => Promise<R>,
  opts: RetryOptions,
  attempt: number = 0,
): Promise<R> {
  const retries = opts.retries || 5
  const factor = opts.factor || 2
  const minTimeout = opts.minTimeout || 100

  let aborted = false

  const bail = (err?: Error) => {
    aborted = true
    throw err || new Error('Aborted')
  }

  try {
    return await cb(bail, attempt)
  } catch (err) {
    if (opts.onRetry) opts.onRetry(err, attempt)
    if (aborted || attempt >= retries) throw err

    await sleep(minTimeout * Math.pow(factor, attempt))

    return retry(cb, opts, attempt + 1)
  }
}

export default function fetchRetry(fetch: GlobalFetch['fetch']) {
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
        throw new FetchError(res.statusText, res)
      }

      return res
    }, retryOpts)
  }
  return fn
}
