export const config = { api: { bodyParser: false } }

export default async function handler(request, response) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  response.json({
    destination: 'echo',
    method: request.method,
    body: Buffer.concat(chunks).toString(),
    query: request.query,
    proxy: request.headers['x-contract-proxy'] ?? null,
  })
}
