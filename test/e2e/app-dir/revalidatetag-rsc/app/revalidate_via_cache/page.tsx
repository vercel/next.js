import { revalidateTag, unstable_cache } from 'next/cache'

export const dynamic = 'force-dynamic'

const revalidateInCache = unstable_cache(async () => {
  revalidateTag('data', 'max')
})

export default async function Page() {
  await revalidateInCache()

  return <p>revalidated</p>
}
