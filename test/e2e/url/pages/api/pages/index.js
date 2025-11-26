import fs from 'fs'

import imported from '../../../public/vercel.png'
const url = new URL('../../../public/vercel.png', import.meta.url)

export default (req, res) => {
  let size
  try {
    size = fs.readFileSync(url).length
  } catch (e) {
    size = e.message
  }

  res.send({
    imported,
    url: url.toString(),
    size,
  })
}
