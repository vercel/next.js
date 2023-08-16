// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next'

type Data = {
  hello: string
  input?: string | string[]
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  const innerRes = await fetch(
    `http://127.0.0.1:${process.env.PORT}/api/basic?input=test`
  )
  const json = await innerRes.json()
  res.status(200).json(json)
}
