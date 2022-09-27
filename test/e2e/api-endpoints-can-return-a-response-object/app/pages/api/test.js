export default (req, res) => {
  res.setHeader('x-from-node-api', '1')
  res.setHeader('set-cookie', ['test1=1', 'test2=2'])

  const headers = new Headers()
  headers.append('x-will-be-merged', '1')
  headers.append('x-incoming-url', req.url)
  headers.append('set-cookie', 'test3=3')
  headers.append('set-cookie', 'test4=4')

  return new Response('from Response', {
    status: 201,
    headers,
  })
}
