if (!global._payload) {
  global._payload = {
    payload: null,
    reload: false,
    ws: null,
  }
}

export const subscribeToHMR = async () => {
  let cached = global._payload

  if (cached.payload) {
    if (cached.reload === true) {
      let resolve: any

      cached.reload = new Promise((res) => (resolve = res))

      await new Promise((resolve) => setTimeout(resolve, 200))

      resolve()
    }
    if (cached.reload instanceof Promise) {
      await cached.reload
    }

    return cached.payload
  }

  cached.payload = {}

  const port = process.env.PORT || '3000'
  const hasHTTPS =
    process.env.USE_HTTPS === 'true' ||
    process.argv.includes('--experimental-https')
  const protocol = hasHTTPS ? 'wss' : 'ws'
  const path = '/_next/webpack-hmr'
  // The __NEXT_ASSET_PREFIX env variable is set for both assetPrefix and basePath (tested in Next.js 15.1.6)
  const prefix = process.env.__NEXT_ASSET_PREFIX ?? ''
  cached.ws = new WebSocket(
    process.env.PAYLOAD_HMR_URL_OVERRIDE ??
      `${protocol}://localhost:${port}${prefix}${path}`
  )
  cached.ws.onmessage = (event: any) => {
    if (typeof event.data === 'string') {
      const data = JSON.parse(event.data)
      if (
        // On Next.js 15, we need to check for data.action. On Next.js 16, we need to check for data.type.
        data.type === 'serverComponentChanges' ||
        data.action === 'serverComponentChanges'
      ) {
        cached.reload = true
      }
    }
  }
}
