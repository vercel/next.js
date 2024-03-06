export const config = {
  runtime: 'edge',
}

export default function handler(req) {
  // ensure performance is available in edge
  console.log(performance.now())

  return Response.json({ text: 'hello world' })
}
