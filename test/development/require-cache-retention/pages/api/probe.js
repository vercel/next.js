import collect from 'require-cache-retention-probe'

export default async function handler(req, res) {
  res.json({ version: 1, ...(await collect()) })
}
