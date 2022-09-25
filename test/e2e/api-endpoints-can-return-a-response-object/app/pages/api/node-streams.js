import { Readable } from 'stream'

export default (req, res) => {
  res.setHeader('x-from-node-api', '1')

  const stream = Readable.from(
    (async function* () {
      yield 'hello\n'
      await new Promise((resolve) => setTimeout(resolve, 200))
      yield 'world\n'
    })()
  )

  return new Response(stream, {
    status: 201,
    headers: {
      'x-will-be-merged': '1',
      'x-incoming-url': req.url,
    },
  })
}
