import http from 'http'
import https from 'https'

const LOOPBACK_PROBE_METHOD = 'HEAD'
const LOOPBACK_PROBE_PATH = '/_next/static/chunks/__nextjs_loopback_probe__.js'
const LOOPBACK_PROBE_TIMEOUT_MS = 1200

type ProbeRequestProtocol = 'http' | 'https'

type ProbeRequestOptions = {
  host: string
  port: number
  protocol: ProbeRequestProtocol
  timeoutMs?: number
}

export type LoopbackAddressMismatchOptions = {
  isDev: boolean
  hostname?: string
  actualHostname: string
  port: number
  protocol: ProbeRequestProtocol
}

export async function detectLoopbackAddressMismatch(
  options: LoopbackAddressMismatchOptions,
  probeLoopbackHost: (
    options: ProbeRequestOptions
  ) => Promise<boolean> = requestLoopbackHost
): Promise<boolean> {
  if (!options.isDev || options.hostname || options.actualHostname !== '[::]') {
    return false
  }

  const [ipv6Reachable, ipv4Reachable] = await Promise.all([
    probeLoopbackHost({
      host: '::1',
      port: options.port,
      protocol: options.protocol,
    }),
    probeLoopbackHost({
      host: '127.0.0.1',
      port: options.port,
      protocol: options.protocol,
    }),
  ])

  return ipv6Reachable && !ipv4Reachable
}

export function getLoopbackAddressMismatchWarning(
  port: number,
  protocol: ProbeRequestProtocol
): string {
  const appUrl = `${protocol}://localhost:${port}`
  const ipv4Url = `${protocol}://127.0.0.1:${port}`

  return (
    `Detected different loopback behavior on port ${port}: ${appUrl} is reachable via IPv6 ` +
    `but ${ipv4Url} did not respond. Another process may be occupying the IPv4 port. ` +
    `Use --hostname 127.0.0.1 to force IPv4 and surface port conflicts early.`
  )
}

async function requestLoopbackHost({
  host,
  port,
  protocol,
  timeoutMs = LOOPBACK_PROBE_TIMEOUT_MS,
}: ProbeRequestOptions): Promise<boolean> {
  const requestFn = protocol === 'https' ? https.request : http.request

  return new Promise<boolean>((resolve) => {
    const req = requestFn(
      {
        host,
        port,
        method: LOOPBACK_PROBE_METHOD,
        path: LOOPBACK_PROBE_PATH,
        rejectUnauthorized: false,
      },
      (res) => {
        res.destroy()
        resolve(true)
      }
    )

    req.on('error', () => resolve(false))
    req.setTimeout(timeoutMs, () => {
      req.destroy()
      resolve(false)
    })
    req.end()
  })
}
