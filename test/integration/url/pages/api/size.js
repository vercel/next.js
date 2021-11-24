import fs from 'fs'

const img = new URL('../../public/vercel.png', import.meta.url)

export default (req, res) => {
  res.json({ size: fs.readFileSync(img).length })
}
