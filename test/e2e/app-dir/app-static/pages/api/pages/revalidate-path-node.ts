import { revalidatePath } from 'next/server'

export default async function handler(req, res) {
  const path = req.query['path'] || '/'
  try {
    console.log('revalidating path', path)
    await revalidatePath(path)
    return res.json({ revalidated: true, now: Date.now() })
  } catch (err) {
    console.error('Failed to revalidate', path, err)
    return res.json({ revalidated: false, now: Date.now() })
  }
}
