import { notFound, unstable_rethrow } from 'next/navigation'

export default async function Page() {
  try {
    notFound()
  } catch (err) {
    unstable_rethrow(err)
    console.error(err)
  }

  return <p>hello world</p>
}
