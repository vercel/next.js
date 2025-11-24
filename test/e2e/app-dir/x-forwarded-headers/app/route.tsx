export function GET(req: Request) {
  return Response.json(Object.fromEntries(req.headers))
}
