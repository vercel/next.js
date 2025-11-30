import { measure } from '../../lib/measure'

export default async function handler(req, res) {
  const result = await measure(
    'pages api esm',
    () => import('../../lib/esm.js')
  )

  res.status(200).json(result)
}
