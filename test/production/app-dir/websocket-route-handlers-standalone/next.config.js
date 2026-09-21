/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    webSocketRouteHandlers: true,
  },
  async headers() {
    return [
      {
        source: '/runtime-static',
        headers: [
          { key: 'Age', value: '60' },
          { key: 'Cache-Control', value: 'public, s-maxage=86400' },
          { key: 'CDN-Cache-Control', value: 'public, max-age=86400' },
          {
            key: 'Cloudflare-CDN-Cache-Control',
            value: 'public, max-age=86400',
          },
          { key: 'Connection', value: 'x-standalone-hop, set-cookie' },
          { key: 'Content-Encoding', value: 'gzip' },
          { key: 'Content-Type', value: 'application/json' },
          { key: 'Edge-Control', value: 'cache-maxage=1d' },
          { key: 'ETag', value: '"poisoned"' },
          { key: 'Example-Cache-Control', value: 'public, max-age=86400' },
          { key: 'Expires', value: 'Wed, 21 Oct 2099 07:28:00 GMT' },
          { key: 'Last-Modified', value: 'Wed, 21 Oct 2015 07:28:00 GMT' },
          {
            key: 'Netlify-CDN-Cache-Control',
            value: 'public, max-age=86400',
          },
          {
            key: 'Proxy-Connection',
            value: 'cache-control, content-type, x-standalone-proxy-hop',
          },
          { key: 'Set-Cookie', value: 'standalone-secret=1; Path=/' },
          { key: 'Surrogate-Control', value: 'max-age=86400' },
          {
            key: 'Vercel-CDN-Cache-Control',
            value: 'public, max-age=86400',
          },
          { key: 'X-Accel-Buffering', value: 'yes' },
          { key: 'X-Accel-Expires', value: '86400' },
          { key: 'X-Accel-Redirect', value: '/private/standalone' },
          { key: 'X-Lighttpd-Send-File', value: '/private/lighttpd' },
          { key: 'X-Sendfile', value: '/private/sendfile' },
          { key: 'x-standalone-hop', value: 'hop-secret' },
          { key: 'x-standalone-proxy-hop', value: 'proxy-hop-secret' },
          { key: 'x-standalone-public', value: 'public-value' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
