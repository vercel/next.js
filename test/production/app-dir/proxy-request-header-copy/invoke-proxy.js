// Runs the proxy of the build output in this process the way a deployment
// adapter does: it sets up the Node.js environment, loads the proxy module and
// calls its `handler` with a Web `Request`. Every `Headers` object that is
// copied with `new Headers(headers)` is recorded in `globalThis.copiedHeaders`,
// which the proxy reads.
const path = require('path')

process.env.NODE_ENV = 'production'

require('next/dist/build/adapter/setup-node-env.external')

// A `Proxy` and not a subclass, so that `instanceof Headers` stays true for
// the headers that the platform creates.
globalThis.copiedHeaders = new WeakSet()
globalThis.Headers = new Proxy(Headers, {
  construct(target, args, newTarget) {
    if (args[0] instanceof target) {
      globalThis.copiedHeaders.add(args[0])
    }
    return Reflect.construct(target, args, newTarget)
  },
})

async function main() {
  const { handler } = require(
    path.join(__dirname, '.next/server/middleware.js')
  )

  const response = await handler(
    new Request('http://localhost/', {
      headers: { 'x-forwarded-for': '203.0.113.7' },
    }),
    {
      waitUntil: (promise) => promise.catch(fail),
      requestMeta: { relativeProjectDir: '.' },
    }
  )

  process.stdout.write(
    JSON.stringify({ status: response.status, body: await response.json() }) +
      '\n',
    () => process.exit(0)
  )
}

function fail(error) {
  console.error(error)
  process.exit(1)
}

main().catch(fail)
