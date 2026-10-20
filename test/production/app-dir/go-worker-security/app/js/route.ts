export function GET() {
  return Response.json({ language: 'js', pid: process.pid })
}
