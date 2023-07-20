import Link from 'next/link'
export default function HomePage() {
  return (
    <>
      <Link href="/dashboard" id="to-dashboard">
        To Dashboard
      </Link>
      <Link href="/static-page" id="to-static-page">
        To Static Page
      </Link>
      <ul>
        {[...Array(20)].map((_, i) => (
          <li key={i}>
            <Link href={`/dashboard/${i}`} key={i}>
              To Dashboard {i}
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
