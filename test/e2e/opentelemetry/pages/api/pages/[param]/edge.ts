export const config = {
  runtime: 'edge',
}

export default function handler(req) {
  return Response.json({ text: 'hello world' })
}
