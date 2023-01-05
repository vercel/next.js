export function handleMethodNotAllowedResponse(): Response {
  return new Response(null, {
    status: 405,
    statusText: 'Method Not Allowed',
  })
}

export function handleBadRequestResponse(): Response {
  return new Response(null, {
    status: 400,
    statusText: 'Bad Request',
  })
}

export function handleInternalServerErrorResponse(): Response {
  return new Response(null, {
    status: 500,
    statusText: 'Internal Server Error',
  })
}
