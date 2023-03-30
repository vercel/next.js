// @ts-check

import cookies from '../../../cookies'

export default async function handler(_req, res) {
  res.setHeader('set-cookie', cookies)

  res.json(null)
}
