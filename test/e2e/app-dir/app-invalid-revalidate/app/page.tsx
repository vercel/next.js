// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { unstable_cache } from 'next/cache'
// export const revalidate = '1'

export default async function Page() {
  // await fetch('https://example.vercel.sh', { next: { revalidate: '1' } })
  // await unstable_cache(async () => Date.now(), [], { revalidate: '1' })()
  return <p>hello world</p>
}
