import { measure } from '../../lib/measure'

export default async function handler(req, res) {
  const result = await measure(
    'pages api commonjs',
    () => import('../../lib/commonjs.js')
  )

  res.status(200).json(result)
}
