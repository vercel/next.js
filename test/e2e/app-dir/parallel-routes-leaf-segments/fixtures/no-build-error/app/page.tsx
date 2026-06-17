import Link from 'next/link'

export default function HomePage() {
  return (
    <div>
      <h1>Parallel Routes Leaf Segments Test</h1>
      <nav>
        <ul>
          <li>
            <Link href="/leaf-segment">Leaf Segment (No Default Required)</Link>
          </li>
          <li>
            <Link href="/leaf-with-groups">
              Leaf with Route Groups (No Default Required)
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  )
}
