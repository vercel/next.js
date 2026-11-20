// @ts-check

// Bounded retry with backoff for GitHub API requests made by CI scripts.
//
// Retried: 429, any 5xx, and a 403 that is a rate limit (GitHub reports both
// primary and secondary rate limits as either 403 or 429). Every other status,
// and a fetch that rejects (a transport failure says nothing about whether a
// write landed), is returned or thrown to the caller as is.

const DEFAULT_MAX_ATTEMPTS = 4
const DEFAULT_BASE_DELAY_MS = 2_000
// Waits requested by GitHub through `Retry-After` or `x-ratelimit-reset` are
// honoured up to this long; a longer wait gives up instead of holding the
// runner.
const DEFAULT_MAX_RETRY_WAIT_MS = 120_000

/** @type {WeakMap<Response, { attempts: number, transient: boolean }>} */
const retryMetadata = new WeakMap()

/**
 * @typedef {object} RetryOptions
 * @property {string} [description] Request label for log lines, e.g. "GET /repos/o/r".
 * @property {number} [maxAttempts] Total attempts, including the first one.
 * @property {number} [baseDelayMs] Backoff before the first retry, doubled after each one.
 * @property {number} [maxRetryWaitMs] Longest wait to honour; a longer one gives up.
 * @property {boolean} [retryServerErrors] Retry 5xx. Disable for writes that
 *   are not safe to repeat: a 5xx does not tell whether the write happened,
 *   while a rate limit response means it was rejected.
 * @property {typeof fetch} [fetch]
 * @property {(ms: number) => Promise<void>} [sleep]
 * @property {() => number} [random]
 * @property {(message: string) => void} [log]
 */

/**
 * `fetch` that retries rate limited and server error responses. Resolves with
 * the final response, successful or not, so callers keep their own error
 * reporting; `getRetryMetadata` tells how it got there.
 *
 * @param {string} url
 * @param {RequestInit} init
 * @param {RetryOptions} [options]
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, init, options = {}) {
  const {
    description = `${init.method || 'GET'} ${url}`,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    maxRetryWaitMs = DEFAULT_MAX_RETRY_WAIT_MS,
    retryServerErrors = true,
    fetch: fetchImpl = fetch,
    sleep = defaultSleep,
    random = Math.random,
    log = console.log,
  } = options

  for (let attempt = 1; ; attempt++) {
    const res = await fetchImpl(url, init)
    const rateLimited = res.ok ? false : await isRateLimited(res)
    const serverError = res.status >= 500
    const transient = rateLimited || serverError
    retryMetadata.set(res, { attempts: attempt, transient })

    if (!transient) {
      return res
    }

    const failure = `${description} failed with ${res.status}`

    if (serverError && !retryServerErrors) {
      log(`${failure}; not retrying, the request may have been processed`)
      return res
    }

    if (attempt >= maxAttempts) {
      log(`${failure}; giving up after ${attempt} attempts`)
      return res
    }

    // A 503 may carry `Retry-After` too.
    const requestedWait = getRequestedWaitMs(res.headers)
    if (requestedWait !== null && requestedWait > maxRetryWaitMs) {
      log(
        `${failure}; giving up, GitHub asked to wait ${formatSeconds(requestedWait)}, more than the ${formatSeconds(maxRetryWaitMs)} limit`
      )
      return res
    }

    // Equal jitter: half of the exponential step, plus a random part of the
    // other half, so concurrent callers spread out.
    const step = Math.min(baseDelayMs * 2 ** (attempt - 1), maxRetryWaitMs)
    const delay = requestedWait ?? Math.round(step / 2 + (random() * step) / 2)

    log(
      `${failure} (attempt ${attempt}/${maxAttempts}); retrying in ${formatSeconds(delay)}`
    )
    // Release the connection of the response that is being discarded.
    await res.body?.cancel().catch(() => {})
    await sleep(delay)
  }
}

/**
 * How a response returned by `fetchWithRetry` was obtained. `transient` is
 * true when it is a rate limit or server error response that was not retried
 * further.
 *
 * @param {Response} res
 * @returns {{ attempts: number, transient: boolean }}
 */
function getRetryMetadata(res) {
  return retryMetadata.get(res) || { attempts: 1, transient: false }
}

/**
 * @param {Response} res
 */
async function isRateLimited(res) {
  if (res.status === 429) {
    return true
  }
  if (res.status !== 403) {
    return false
  }
  if (
    res.headers.get('retry-after') !== null ||
    res.headers.get('x-ratelimit-remaining') === '0'
  ) {
    return true
  }

  // Secondary rate limits may come without either header. Read a clone so the
  // caller can still read the body.
  const text = await res
    .clone()
    .text()
    .catch(() => '')
  return /rate limit/i.test(text)
}

/**
 * The wait GitHub asked for, from `Retry-After` (seconds or an HTTP date) or,
 * when the rate limit is exhausted, `x-ratelimit-reset` (epoch seconds).
 *
 * @param {Headers} headers
 * @returns {number | null}
 */
function getRequestedWaitMs(headers) {
  const retryAfter = headers.get('retry-after')
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds)) {
      return Math.max(0, seconds * 1000)
    }

    const retryAt = Date.parse(retryAfter)
    if (Number.isFinite(retryAt)) {
      return Math.max(0, retryAt - Date.now())
    }
  }

  const reset = Number(headers.get('x-ratelimit-reset'))
  if (headers.get('x-ratelimit-remaining') === '0' && reset > 0) {
    return Math.max(0, reset * 1000 - Date.now())
  }

  return null
}

/**
 * @param {number} ms
 */
function formatSeconds(ms) {
  return `${Math.round(ms / 100) / 10}s`
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

module.exports = {
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_BASE_DELAY_MS,
  DEFAULT_MAX_RETRY_WAIT_MS,
  fetchWithRetry,
  getRetryMetadata,
}
