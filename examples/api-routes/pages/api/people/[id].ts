import { NextApiRequest, NextApiResponse } from 'next'
import { people } from '../../../data'
import { Person } from '../../../interfaces'

type ResponseError = {
  message: string
}

export default function personHandler(
  req: NextApiRequest,
  res: NextApiResponse<Person | ResponseError>
) {
  const { query } = req
  const { id } = query
  const filtered = people.filter((p) => p.id === id)

  // User with id exists
  return filtered.length > 0
    ? res.status(200).json(filtered[0])
    : res.status(404).json({ message: `User with id: ${id} not found.` })
}
