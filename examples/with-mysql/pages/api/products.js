// Next.js API route support: https://nextjs.org/docs/pages/building-your-application/routing/api-routes
import prisma from './../../lib/prisma.js'

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const data = await prisma.product.findMany({})
      return res.status(200).json({ data })
    } catch (err) {
      console.error(err)
      return res.status(500).json({ msg: 'Something went wrong' })
    }
  } else {
    return res.status(405).json({ msg: 'Method not allowed' })
  }
}
