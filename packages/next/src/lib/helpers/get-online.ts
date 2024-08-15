import { execSync } from 'child_process'
import dns from 'dns/promises'

function getProxy(): string | undefined {
  if (process.env.https_proxy) {
    return process.env.https_proxy
  }

  try {
    const httpsProxy = execSync('npm config get https-proxy', {
      encoding: 'utf8',
    }).trim()
    return httpsProxy !== 'null' ? httpsProxy : undefined
  } catch (e) {
    return
  }
}

export async function getOnline(): Promise<boolean> {
  try {
    await dns.lookup('registry.yarnpkg.com')
    return true
  } catch {
    const proxy = getProxy()
    if (!proxy) {
      return false
    }

    try {
      const { hostname } = new URL(proxy)
      await dns.lookup(hostname)
      return true
    } catch {
      return false
    }
  }
}
