// Grouped export: config is declared then exported (issue #56451)
const config = {
  matcher: ['/api/:path*'],
}

function middleware() {
  return new Response('ok')
}

export { middleware, config }
