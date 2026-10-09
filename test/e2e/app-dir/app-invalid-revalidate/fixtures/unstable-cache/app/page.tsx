import { unstable_cache } from 'next/cache'

export default async function Page() {
  await unstable_cache(async () => Date.now(), [], { revalidate: '1' })()
  return <p>hello world</p>
}
