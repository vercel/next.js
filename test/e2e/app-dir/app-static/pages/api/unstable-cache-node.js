import { unstable_cache } from 'next/cache'

export default async function handler(req, res) {
  const data = await unstable_cache(async () => {
    return {
      random: Math.random(),
    }
  })()

  res.json({
    now: Date.now(),
    data,
  })
}
