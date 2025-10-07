import Link from 'next/link'
import { connection } from 'next/server'

export default async function Page() {
  return (
    <div>
      <h1>Delay Icons</h1>
      <Link id="custom-icon-sub-link" href="/custom-icon/sub">
        Go to another page with custom icon
      </Link>
      <br />
      <Link id="custom-icon-sub-link" href="/custom-icon">
        Go to root page with custom icon
      </Link>
    </div>
  )
}

export async function generateMetadata() {
  await connection()
  return {
    // This long text description will lead to the metadata being inserted after the head tag.
    description: 'long text description'.repeat(1000),
    icons: {
      icon: `/heart.png`,
    },
  }
}
