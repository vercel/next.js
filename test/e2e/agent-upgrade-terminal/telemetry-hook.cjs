// Preloaded with --require. Logs the event names Next.js sends to its
// telemetry endpoint and answers those requests without the network.
const fs = require('fs')

const realFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input)
  if (!url.startsWith('https://telemetry.nextjs.org/')) {
    return realFetch(input, init)
  }
  for (const { eventName } of JSON.parse(init.body).events) {
    fs.appendFileSync(
      process.env.UPGRADE_TERMINAL_TELEMETRY_LOG,
      `${eventName}\n`
    )
  }
  return new Response(null, { status: 200 })
}
