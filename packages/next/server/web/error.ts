export class DeprecationError extends Error {
  constructor() {
    super(`Middleware now accepts an async API directly with the form:
  
  export function middleware(request, event) {
    return new Response("Hello " + request.url)
  }
  `)
  }
}
