import fs from 'fs'

import imported from '../../../public/vercel.png'
const url = new URL('../../../public/vercel.png', import.meta.url)

export default (req, res) => {
  res.json({
    imported,
    url: url.toString(),
    size: fs.readFileSync(url).length,
  })
}
