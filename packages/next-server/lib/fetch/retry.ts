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
  cb: (bail: (err?: Error) => never, attempt: number, options: RetryOptions) => Promise<R>,
  options: RetryOptions,
  attempt: number = 0,
): Promise<R> {
  const opts = {
    // timeouts will be [ 10, 50, 250 ]
    minTimeout: options.minTimeout || 10,
    retries: options.retries || 3,
    factor: options.factor || 5,
    onRetry: options.onRetry,
  }

  let aborted = false

  const bail = (err?: Error) => {
    aborted = true
    throw err || new Error('Aborted')
  }

  try {
    return await cb(bail, attempt, opts)
  } catch (err) {
    if (opts.onRetry) opts.onRetry(err, attempt)
    if (aborted || attempt >= opts.retries) throw err

    await sleep(opts.minTimeout * Math.pow(opts.factor, attempt))

    return retry(cb, opts, attempt + 1)
  }
}

export default function fetchRetry(fetch: GlobalFetch['fetch']) {
  const fn = (url: RequestInfo, opts: RequestInit & { retry?: RetryOptions } = {}) => {
    return retry(async (_bail, attempt, retryOpts) => {
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
    }, opts.retry || {})
  }
  return fn
}
