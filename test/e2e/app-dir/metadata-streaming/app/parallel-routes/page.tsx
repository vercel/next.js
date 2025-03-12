import Link from 'next/link'

export default function Page() {
  return (
    <div>
      Hello from Nested{' '}
      <Link href="/parallel-routes/test-page">
        To /parallel-routes/test-page
      </Link>
      <Link href="/parallel-routes/no-bar">To /parallel-routes/no-bar</Link>
    </div>
  )
}

export const metadata = {
  title: 'parallel title',
}
