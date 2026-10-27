// Behavioral checks for nextjs/clean-checkout-route-types.
//
// Runs against the production server and proves the repair preserved every
// route: the marketing layout still scopes to its route group, both dashboard
// slots render, the catch-all docs route resolves nested paths and its search
// param, and the API route handler keeps its JSON contract.
const base = process.env.EVAL_BASE_URL ?? 'http://127.0.0.1:3010'

async function get(path) {
  const response = await fetch(base + path, { redirect: 'manual' })
  // React separates adjacent text and expressions with comment nodes.
  const body = (await response.text()).replace(/<!--[\s\S]*?-->/g, '')
  return { status: response.status, body }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const checks = [
  {
    path: '/',
    status: 200,
    includes: ['Ship APIs', 'href="/pricing"', '© Relay'],
  },
  {
    path: '/pricing',
    status: 200,
    includes: ['Pricing</h1>', 'Unlimited deployments', '© Relay'],
  },
  {
    path: '/dashboard',
    status: 200,
    includes: ['Projects</h1>', 'data-slot="stats"', 'data-slot="activity"'],
    excludes: ['© Relay'],
  },
  {
    path: '/dashboard/projects/relay',
    status: 200,
    includes: [
      'Relay API</h1>',
      'data-status="healthy"',
      'data-slot="stats"',
      'data-slot="activity"',
    ],
  },
  { path: '/dashboard/projects/nope', status: 404 },
  {
    path: '/docs/getting-started/install',
    status: 200,
    includes: ['Install the Relay CLI', 'sign in with your team token'],
  },
  {
    path: '/docs/reference/regions?highlight=fra1',
    status: 200,
    includes: ['Regions</h1>', '<mark>fra1</mark>'],
  },
  { path: '/docs/reference/missing', status: 404 },
]

for (const check of checks) {
  const { status, body } = await get(check.path)
  assert(
    status === check.status,
    `${check.path} returned ${status}, expected ${check.status}`
  )
  for (const text of check.includes ?? []) {
    assert(body.includes(text), `${check.path} is missing "${text}"`)
  }
  for (const text of check.excludes ?? []) {
    assert(!body.includes(text), `${check.path} must not include "${text}"`)
  }
}

const relay = await fetch(base + '/api/projects/relay')
assert(relay.status === 200, `/api/projects/relay returned ${relay.status}`)
const relayBody = await relay.json()
assert(
  relayBody.slug === 'relay' && relayBody.region === 'iad1',
  '/api/projects/relay returned the wrong project'
)

const missing = await fetch(base + '/api/projects/nope')
assert(missing.status === 404, `/api/projects/nope returned ${missing.status}`)
const missingBody = await missing.json()
assert(
  missingBody.error === 'not_found',
  '/api/projects/nope must return the not_found error body'
)
