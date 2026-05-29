import fs from 'fs'
import { fileURLToPath } from 'url'

import imported from '../../../public/vercel.png'
const url = new URL('../../../public/vercel.png', import.meta.url)

export default (req, res) => {
  let size
  try {
    size = fs.readFileSync(fileURLToPath(url)).length
  } catch (e) {
    size = e.message
  }

  res.send({
    imported: imported.src,
    url: url.toString(),
    size,
  })
}
