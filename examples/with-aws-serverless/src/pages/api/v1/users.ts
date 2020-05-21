import { NextApiRequest, NextApiResponse } from 'next'
import { Users } from 'src/mock/users'

const getData = (): Promise<Array<UserModel>> =>
  new Promise(resolve => {
    setTimeout(() => {
      resolve(Users)
    }, 500)
  })

export default async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method!.toLowerCase() !== 'get') {
    res.status(405).send({ error: 'Method Not Allowed' })
  } else {
    const data: Array<UserModel> = await getData()
    res.send({ data, error: '' })
  }
}
