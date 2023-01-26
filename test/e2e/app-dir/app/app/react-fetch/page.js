import Link from 'next/link'
export default function Page() {
  return (
    <>
      <p>
        <Link id="to-server-component" href="/react-fetch/server-component">
          To Server Component
        </Link>
      </p>
      <p>
        <Link id="to-client-component" href="/react-fetch/client-component">
          To Client Component
        </Link>
      </p>
    </>
  )
}
