import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <h1>Home</h1>
      <ul>
        <li>
          <Link href="/with-suspense">With Suspense (partial prerender)</Link>
        </li>
        <li>
          <Link href="/without-suspense">
            Without Suspense (fully dynamic — bug)
          </Link>
        </li>
        <li>
          <Link href="/suspense-around-body">
            Suspense around body (null fallback)
          </Link>
        </li>
      </ul>
    </div>
  )
}
