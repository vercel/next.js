import * as fs from 'fs/promises'
export default async (req, res) => {
  const fileUrl = new URL('../../my-data.json', import.meta.url)
  const content = await fs.readFile(fileUrl, { encoding: 'utf-8' })
  res.json(JSON.parse(content))
}
