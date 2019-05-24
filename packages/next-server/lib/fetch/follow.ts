import { URL } from 'url'
import { Headers } from 'node-fetch'
import { getAgent, NodeFetch } from './utils'

// tslint:disable-next-line no-bitwise
const isRedirect = (v: number) => ((v / 100) | 0) === 3

export default function setupFollowRedirect(fetch: NodeFetch) {
  const followRedirect: NodeFetch = async (url, opts = {}) => {
    const follow = !opts.redirect || opts.redirect === 'follow'

    if (follow) opts.redirect = 'manual'

    const res = await fetch(url, opts)
    const location = res.headers.get('Location')

    if (!follow || !isRedirect(res.status) || !location) {
      return res
    }

    const redirectOpts = { ...opts, headers: new Headers(opts.headers) }
    const locationUrl = new URL(location)

    // per fetch spec, for POST request with 301/302 response, or any request with 303 response,
    // use GET when following redirect
    if (
      res.status === 303 ||
      ((res.status === 301 || res.status === 302) && opts.method === 'POST')
    ) {
      redirectOpts.method = 'GET'
      redirectOpts.body = undefined
      redirectOpts.headers.delete('content-length')
    }

    redirectOpts.headers.set('Host', locationUrl.host || '')
    redirectOpts.agent = getAgent(location)

    return followRedirect(location, redirectOpts)
  }
  return followRedirect
}
