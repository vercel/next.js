import { revalidateTag } from 'next/server'

export default async function GET(_req, res) {
  await revalidateTag('thankyounext')
  return res.json({ revalidated: true, now: Date.now() })
}
