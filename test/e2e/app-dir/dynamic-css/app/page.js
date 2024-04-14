import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <Link id="ssr" href="/ssr">
        SSR
      </Link>
    </div>
  )
}
