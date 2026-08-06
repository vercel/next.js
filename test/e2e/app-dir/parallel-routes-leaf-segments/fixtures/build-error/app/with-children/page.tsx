import Link from 'next/link'

export default function WithChildrenPage() {
  return (
    <div>
      <h2>Parent Page</h2>
      <p>This is a NON-leaf segment with child routes.</p>
      <nav>
        <Link href="/with-children/child">Go to Child</Link>
      </nav>
    </div>
  )
}
