import { Pool } from 'pg'

export default async (req, res) => {
  console.log(Pool)
  console.log(req, res)
  res.status(200).json({ message: 'hello world', req, res, Pool })
}
