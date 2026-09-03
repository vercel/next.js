export class PageSignatureError extends Error {
  constructor({ page }: { page: string }) {
    super(`The proxy "${page}" accepts an async API directly with the form:
  
  export function proxy(request, event) {
    return NextResponse.redirect('/new-location')
  }
  
  Read more: https://nextjs.org/docs/messages/proxy-new-signature
  `)
  }
}

export class RemovedPageError extends Error {
  constructor() {
    super(`The request.page has been deprecated in favour of \`URLPattern\`.
  Read more: https://nextjs.org/docs/messages/proxy-request-page
  `)
  }
}

export class RemovedUAError extends Error {
  constructor() {
    super(`The request.ua has been removed in favour of \`userAgent\` function.
  Read more: https://nextjs.org/docs/messages/proxy-parse-user-agent
  `)
  }
}
