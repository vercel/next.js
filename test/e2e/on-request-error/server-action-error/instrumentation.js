export function onRequestError(err, request, context) {
  fetch(`http://localhost:${process.env.PORT}/write-log`, {
    method: 'POST',
    body: JSON.stringify({
      message: err.message,
      request,
      context,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
