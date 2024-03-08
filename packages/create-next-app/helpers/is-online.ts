import { execSync } from 'child_process'
import dns from 'dns/promises'
import url from 'url'

function getProxy(): string | undefined {
  if (process.env.https_proxy) {
    return process.env.https_proxy
  }

  try {
    const httpsProxy = execSync('npm config get https-proxy').toString().trim()
    return httpsProxy !== 'null' ? httpsProxy : undefined
  } catch (e) {
    return
  }
}

export async function getOnline(): Promise<boolean> {
  try {
    await dns.lookup('registry.yarnpkg.com')
    // If DNS lookup succeeds, we are online
    return true
  } catch {
    // The DNS lookup failed, but we are still fine as long as a proxy has been set
    const proxy = getProxy()
    if (!proxy) {
      return false
    }

    const { hostname } = url.parse(proxy)
    if (!hostname) {
      // Invalid proxy URL
      return false
    }

    try {
      await dns.lookup(hostname)
      // If DNS lookup succeeds for the proxy server, we are online
      return true
    } catch {
      // The DNS lookup for the proxy server also failed, so we are offline
      return false
    }
  }
}
