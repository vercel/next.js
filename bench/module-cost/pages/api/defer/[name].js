import { deferCases } from '../../../lib/defer-cases'
import { measure } from '../../../lib/measure'

export default async function handler(req, res) {
  const { name } = req.query
  const load = deferCases[name]
  if (!load) {
    res.status(404).json({ error: `Unknown case ${name}` })
    return
  }
  const result = await measure(`pages api ${name}`, load)

  res.status(200).json(result)
}
