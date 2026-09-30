const http = require('node:http')
require('next/dist/server/node-environment')
require('next/dist/server/require-hook')
require('next/dist/server/node-polyfill-crypto')
const { addRequestMeta } = require('next/dist/server/request-meta')
const {
  getRouteRegex,
} = require('next/dist/shared/lib/router/utils/route-regex')
const {
  getRouteMatcher,
} = require('next/dist/shared/lib/router/utils/route-matcher')

const routes = {
  '/[...slug]': require('./.next/server/pages/[...slug].js'),
  '/pages-victim/[id]': require('./.next/server/pages/pages-victim/[id].js'),
  '/closed/[...slug]': require('./.next/server/pages/closed/[...slug].js'),
  '/api-admission/[...slug]': require('./.next/server/app/api-admission/[...slug]/route.js'),
  '/app-victim/[id]': require('./.next/server/app/app-victim/[id]/page.js'),
  '/app-only/[...slug]': require('./.next/server/app/app-only/[...slug]/page.js'),
  '/app-only/victim/[id]': require('./.next/server/app/app-only/victim/[id]/page.js'),
}

// A test adapter supplies the trusted route selection. This deliberately does
// not rerun next start's router before invoking the selected compiled handler.
const server = http.createServer((req, res) => {
  const route = routes[req.headers['x-matched-path']]
  if (!route) {
    res.statusCode = 404
    res.end()
    return
  }
  // Next 15 adapters supply the matched params to App handlers; their full
  // module names still include /page or /route at this entrypoint.
  const pathname =
    new URL(req.url, 'http://localhost').pathname.replace(
      /^\/(en|fr)(?=\/|$)/,
      ''
    ) || '/'
  const params = getRouteMatcher(getRouteRegex(req.headers['x-matched-path']))(
    pathname
  )
  if (params) addRequestMeta(req, 'params', params)
  addRequestMeta(req, 'minimalMode', true)
  addRequestMeta(req, 'relativeProjectDir', '.')
  addRequestMeta(req, 'initURL', `http://localhost${req.url}`)
  Promise.resolve(route.handler(req, res, { waitUntil() {} })).catch(
    (error) => {
      console.error(error)
      if (!res.writableEnded) {
        res.statusCode = 500
        res.end('Internal Server Error')
      }
    }
  )
})
server.listen(Number(process.env.PORT), () => {
  console.log(`- Local: http://localhost:${server.address().port}`)
  console.log('minimal server ready')
})
