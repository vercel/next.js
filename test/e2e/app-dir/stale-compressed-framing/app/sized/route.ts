const body = 'sized by the handler'
const headers = { 'content-length': String(body.length) }

export function GET() {
  return new Response(body, { headers })
}

export function HEAD() {
  return new Response(null, { headers })
}
