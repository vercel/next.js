export const runtime = 'edge'

export default (req) => {
  return Response.json(Object.fromEntries(req.headers.entries()), {
    headers: {
      'headers-from-edge-function': '1',
    },
  })
}
