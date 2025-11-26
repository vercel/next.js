import { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'

export default function Page() {
  return (
    <>
      <Link id="custom-icon-sub-link" href="/custom-icon/sub">
        Go to another page with custom icon
      </Link>
    </>
  )
}

export async function generateMetadata(): Promise<Metadata> {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 300))

  return {
    icons: {
      // add version query to avoid caching on client side with multiple navs
      icon: `/heart.png?v=${Math.round(Math.random() * 1000)}`,
    },
  }
}
