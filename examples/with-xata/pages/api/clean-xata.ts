import type { NextApiHandler } from 'next'
import { getXataClient } from '../../utils/xata.codegen'

const xata = getXataClient()

const deleteItem = async (id: string) => {
  return await xata.db.nextjs_with_xata_example.delete(id);
}

const cleanDummyDataFromXata: NextApiHandler = async (req, res) => {
  const { id } = req.body;
  await deleteItem(id);
  res.json({
    ok: true,
  })
}

export default cleanDummyDataFromXata
