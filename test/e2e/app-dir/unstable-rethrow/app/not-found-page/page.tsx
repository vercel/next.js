import { notFound, unstable_rethrow } from 'next/navigation'

export default async function Page() {
  try {
    notFound()
  } catch (err) {
    console.log('[test assertion]: checking error')
    unstable_rethrow(err)
    console.error('[test assertion]: error leaked', err)
  }

  return <p>hello world</p>
}
