import path from 'path'

const img = new URL('../../public/vercel.png', import.meta.url)

export default (req, res) => {
  res.json({ basename: path.posix.basename(img.pathname) })
}
