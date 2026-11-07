// Runs the proxy of the build output in this process the way a deployment
// adapter does: it sets up the Node.js environment, loads the proxy module and
// calls its `handler` with a Web `Request`, with or without a signal. It
// reports the response and which signal Next.js constructed its request with.
const path = require('path')

process.env.NODE_ENV = 'production'

require('next/dist/build/adapter/setup-node-env.external')

// `NextRequest` extends the global `Request`, so this sees how it is
// constructed. It has to be in place before the proxy module is loaded.
const constructedWith = []
globalThis.Request = class extends Request {
  constructor(input, init) {
    super(input, init)
    constructedWith.push(init)
  }
}

async function main() {
  const { handler } = require(
    path.join(__dirname, '.next/server/middleware.js')
  )

  const signal = process.argv[2] === 'aborted' ? AbortSignal.abort() : undefined
  const request = new Request('http://localhost/')
  constructedWith.length = 0

  const response = await handler(request, {
    waitUntil: (promise) => promise.catch(fail),
    signal,
    requestMeta: { relativeProjectDir: '.' },
  })

  const requestSignals = constructedWith.map((init) =>
    init?.signal === undefined
      ? 'none'
      : init.signal === signal
        ? 'given'
        : 'other'
  )

  process.stdout.write(
    JSON.stringify({
      status: response.status,
      body: await response.json(),
      requestSignals: [...new Set(requestSignals)],
    }) + '\n',
    () => process.exit(0)
  )
}

function fail(error) {
  console.error(error)
  process.exit(1)
}

main().catch(fail)
