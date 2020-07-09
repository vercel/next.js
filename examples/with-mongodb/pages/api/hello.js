// Next.js API route support: https://nextjs.org/docs/api-routes/introduction

import { connectToDatabase } from '../../util/mongodb'

export default async (req, res) => {
  let db = await connectToDatabase()

  let data = await db.collection('test').stats()

  res.statusCode = 200
  res.json(data)
}
