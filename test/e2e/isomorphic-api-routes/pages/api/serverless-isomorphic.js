export default function handler(req) {
  return Response.json({ works: true, url: req.url })
}
