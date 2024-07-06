export function onRequestError(err, request, context) {
  console.log('[instrumentation]:onRequestError', err.message, request, context)
}
