// Preloaded with `node --import` by test/unit/github-api-retry.test.ts so
// scripts/pr-ci-comment.mjs runs without network access. Responses come from
// the FETCH_STUB_ROUTES env var: a JSON array of
// `{ method?, match, responses: [{ status, headers?, body? }] }`. The first
// route whose `match` is a substring of the URL answers, using its responses in
// order and repeating the last one. Every call is logged to stderr.
//
// Timers are shortened to 0ms so retry backoff does not slow the test down; the
// requested delay is still visible in the script's own retry log lines.

const routes = JSON.parse(process.env.FETCH_STUB_ROUTES || '[]')
const calls = new Map()

globalThis.fetch = async (url, init = {}) => {
  const method = init.method || 'GET'
  const route = routes.find(
    (r) => (!r.method || r.method === method) && String(url).includes(r.match)
  )

  if (!route) {
    console.error(`[fetch-stub] ${method} ${url} -> unmatched`)
    return new Response('stub: no route', { status: 599 })
  }

  const index = calls.get(route) || 0
  calls.set(route, index + 1)
  const spec = route.responses[Math.min(index, route.responses.length - 1)]
  console.error(`[fetch-stub] ${method} ${url} -> ${spec.status}`)

  const body =
    spec.body === undefined
      ? null
      : typeof spec.body === 'string'
        ? spec.body
        : JSON.stringify(spec.body)
  return new Response(spec.status === 204 ? null : body, {
    status: spec.status,
    headers: spec.headers,
  })
}

const realSetTimeout = globalThis.setTimeout
globalThis.setTimeout = (fn, _ms, ...args) => realSetTimeout(fn, 0, ...args)
