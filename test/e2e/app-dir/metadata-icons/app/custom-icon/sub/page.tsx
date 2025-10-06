import { type Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'

export async function generateMetadata(): Promise<Metadata> {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 300))

  return {
    icons: {
      // add version query to avoid caching on client side with multiple navs
      icon: `/star.png?v=${Math.round(Math.random() * 1000)}`,
    },
  }
}

export default function Page() {
  return (
    <>
      <Link id="custom-icon-link" href="/custom-icon">
        Back to previous page with custom icon
      </Link>
    </>
  )
}
