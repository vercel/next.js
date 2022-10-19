export const config = {
  runtime: 'experimental-edge',
}

export default (req) => {
  return Response.json(Object.fromEntries(req.headers.entries()), {
    headers: {
      'headers-from-edge-function': '1',
    },
  })
}
