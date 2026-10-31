import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link id="without-proxy-link" href="/without-proxy" prefetch={false}>
        Without Proxy
      </Link>
      <Link id="with-proxy-link" href="/with-proxy" prefetch={false}>
        With Proxy
      </Link>
    </>
  )
}
