// import express from 'express'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'

// output: "export" mode was originally designed to work seamlessly with the
// "serve" package, which uses "server-handler" internally. It has built-in
// conventions for things like .html extensions and trailing slashes. Apps that
// use a different server like ngnix need configuration to match this behavior.
// TODO: We should improve our documentation around this.
import handler from 'serve-handler'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'out')

export const server = createServer((request, response) => {
  // Redirect /redirect-to-target-page to /target-page. Notice that we only have
  // to redirect the path of the page, not any other resources.
  if (request.url === '/redirect-to-target-page') {
    console.log('Redirecting to /target-page')
    response.writeHead(302, { Location: '/target-page' })
    response.end()
    return
  }

  // Rewrite /rewrite-to-target-page to /target-page
  // NOTE: This simulates a rewrite using a proxy, which is not something we
  // officially support or document. It's just here to illustrate how it would
  // be done in theory.
  if (/^\/rewrite-to-target-page\/?[^/]*$/.test(request.url)) {
    const newUrl = request.url.replace(
      '/rewrite-to-target-page',
      '/target-page'
    )
    console.log(`Rewriting ${request.url} to ${newUrl}`)
    request.url = newUrl
  }

  return handler(request, response, {
    public: OUT_DIR,
  })
})
