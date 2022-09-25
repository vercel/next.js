export default (req, res) => {
  res.setHeader('x-from-node-api', '1')

  return new Response('from Response', {
    status: 201,
    headers: {
      'x-will-be-merged': '1',
      'x-incoming-url': req.url,
    },
  })
}
