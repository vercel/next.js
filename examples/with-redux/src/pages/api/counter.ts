import type { NextApiHandler } from 'next'

const countHandler: NextApiHandler = async (request, response) => {
  const { amount = 1 } = request.body

  // simulate IO latency
  await new Promise((resolve) => setTimeout(resolve, 500))

  response.json({ data: amount })
}

export default countHandler
