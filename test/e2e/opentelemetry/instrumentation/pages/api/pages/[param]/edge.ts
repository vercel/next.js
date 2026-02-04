export const config = {
  runtime: 'edge',
}
// ensure performance is available in edge
console.log(performance.now())

export default function handler(req) {
  return Response.json({ text: 'hello world' })
}
