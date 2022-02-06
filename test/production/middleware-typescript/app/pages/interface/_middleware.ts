import { NextMiddleware } from 'next/server'

export const middleware: NextMiddleware = function (request) {
  console.log(request.ua?.browser)
  console.log(request.ua?.isBot)
  console.log(request.ua?.ua)

  return new Response('hello from middleware', {
    headers: {
      'req-url-basepath': request.nextUrl.basePath,
      'req-url-pathname': request.nextUrl.pathname,
      'req-url-params': JSON.stringify(request.page.params),
      'req-url-page': request.page.name || '',
      'req-url-query': request.nextUrl.searchParams.get('foo') || '',
      'req-url-locale': request.nextUrl.locale,
    },
  })
}
