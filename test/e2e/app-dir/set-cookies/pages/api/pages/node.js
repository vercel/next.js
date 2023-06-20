import cookies from '../../../cookies'

export default async function handler(_req, res) {
  res.appendHeader('set-cookie', cookies)

  res.json(null)
}
