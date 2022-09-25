import { NextResponse } from 'next/server'

export default (req, res) => {
  res.setHeader('x-from-node-api', '1')

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      controller.enqueue(encoder.encode('hello\n'))
      await new Promise((resolve) => setTimeout(resolve, 200))
      controller.enqueue(encoder.encode('world\n'))
      controller.close()
    },
  })

  return new NextResponse(stream, {
    status: 201,
    headers: {
      'x-will-be-merged': '1',
      'x-incoming-url': req.url,
    },
  })
}
