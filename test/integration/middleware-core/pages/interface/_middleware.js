export function middleware(event) {
  event.respondWith(
    new Response(null, {
      headers: {
        'req-url-basepath': event.request.nextUrl.basePath,
        'req-url-pathname': event.request.nextUrl.pathname,
        'req-url-params': JSON.stringify(event.request.page.params),
        'req-url-page': event.request.page.name,
        'req-url-query': event.request.nextUrl.searchParams.get('foo'),
        'req-url-locale': event.request.nextUrl.locale,
      },
    })
  )
}
