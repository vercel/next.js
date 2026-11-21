import http from 'node:http'
import type { AddressInfo } from 'node:net'
import v8 from 'node:v8'
import vm from 'node:vm'

export const dynamic = 'force-dynamic'

// Force a garbage collection without needing `--expose-gc` on the server.
v8.setFlagsFromString('--expose-gc')
const gc = vm.runInNewContext('gc') as () => void

export async function GET(request: Request) {
  const mode = new URL(request.url).searchParams.get('mode')

  // A backend that only answers after a while.
  const server = http.createServer((_req, res) => {
    setTimeout(() => res.end('ok'), 5000).unref()
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`

  const controller = new AbortController()
  const gcInterval = setInterval(gc, 20)
  setTimeout(() => controller.abort(), 500)

  const start = Date.now()
  let result: string
  try {
    if (mode === 'request') {
      await fetch(new Request(url), { signal: controller.signal })
    } else {
      await fetch(url, { signal: controller.signal })
    }
    result = 'resolved'
  } catch (err) {
    result = (err as Error).name
  } finally {
    clearInterval(gcInterval)
    server.closeAllConnections()
    server.close()
  }

  return Response.json({ result, elapsed: Date.now() - start })
}
