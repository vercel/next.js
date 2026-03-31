import type { NextApiHandler } from 'next/types'

type ResponseData = {
  message: string
}

const handler: NextApiHandler<ResponseData> = (req, res) => {
  res.status(200).json({ message: 'Hello from Next.js!' })
}

export default handler
