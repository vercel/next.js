export function middleware(event) {
  const { url } = event.request.next
  if (url.pathname === '/redirect-with-basepath' && !url.basePath) {
    url.basePath = '/root'
    event.respondWith(Response.redirect(url))
  }

  if (url.pathname === '/redirect-with-basepath') {
    url.pathname = '/about'
    event.respondWith(Response.rewrite(url))
  }
}
