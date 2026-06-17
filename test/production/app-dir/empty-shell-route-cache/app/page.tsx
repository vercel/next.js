import Link from 'next/link'

export default function Page() {
  return (
    <main>
      <h1>Empty Shell Route Cache</h1>
      <ul>
        <li>
          <Link href="/with-suspense">With Suspense</Link>
        </li>
        <li>
          <Link href="/without-suspense">Without Suspense</Link>
        </li>
      </ul>
    </main>
  )
}
