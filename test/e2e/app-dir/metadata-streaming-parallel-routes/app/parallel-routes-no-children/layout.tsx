import { connection } from 'next/server'
import Link from 'next/link'

// skip rendering children
export default function Layout({ bar, foo }) {
  return (
    <div>
      <h1>Parallel Routes Layout - No Children</h1>

      <Link href="/parallel-routes-no-children/first" id="to-no-children-first">
        {`to /parallel-routes-no-children/first`}
      </Link>
      <br />
      <Link
        href="/parallel-routes-no-children/second"
        id="to-no-children-second"
      >
        {`to /parallel-routes-no-children/second`}
      </Link>
      <br />

      <div id="foo-slot">{foo}</div>
      <div id="bar-slot">{bar}</div>
    </div>
  )
}

export async function generateMetadata() {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 300))
  return {
    title: 'parallel-routes-default layout title',
  }
}
