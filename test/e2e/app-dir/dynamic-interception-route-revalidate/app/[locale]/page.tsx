import Link from 'next/link'

export default async function Home() {
  return (
    <div>
      Root Page <Link href="/en/photos/1/view">To Photo</Link>
    </div>
  )
}
