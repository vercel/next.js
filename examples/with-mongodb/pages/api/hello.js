// Next.js API route support: https://nextjs.org/docs/api-routes/introduction

import { connectToDatabase } from '../../util/mongodb'

export default async (req, res) => {
  let { client, db } = await connectToDatabase()

  let data = await client.isConnected() // Returns true or false

  res.statusCode = 200
  res.json(data)
}
