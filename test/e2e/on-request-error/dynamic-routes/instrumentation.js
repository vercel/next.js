export function onRequestError(err, request, context) {
  // Keep each callback payload in one message so remote log delivery cannot
  // separate the request identity from its error/context.
  console.log(
    `<request-error>${JSON.stringify({
      message: err.message,
      request: { path: request.path, method: request.method },
      context,
    })}</request-error>`
  )
}
