import Link from 'next/link'

export default function Home() {
  return (
    <>
      <div>
        <Link href={`/nested`} className="text-blue-500">
          nested Page
        </Link>
      </div>
      <h1>This is the Home Page</h1>
    </>
  )
}
