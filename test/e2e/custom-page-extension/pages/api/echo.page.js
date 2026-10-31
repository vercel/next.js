export default function handler(request, response) {
  response.json({
    method: request.method,
    query: request.query,
    body: request.body,
  })
}
