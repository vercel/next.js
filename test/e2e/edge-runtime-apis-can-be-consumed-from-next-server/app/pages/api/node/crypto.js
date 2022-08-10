import { cryptoTest } from '../../../src/crypto'

export default async (req, res) => {
  res.json(await cryptoTest(req))
}
