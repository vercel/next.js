export function middleware(event) {
  event.respondWith(
    new Response(null, {
      headers: {
        'req-url-basepath': event.request.next.url.basePath,
        'req-url-pathname': event.request.next.url.pathname,
        'req-url-params': JSON.stringify(event.request.next.page.params),
        'req-url-page': event.request.next.page.name,
        'req-url-query': event.request.next.url.searchParams.get('foo'),
        'req-url-locale': event.request.next.url.locale,
      },
    })
  )
}
