import Link from 'next/link'

export default function Page() {
  return (
    <>
      <p id="destination">navigation origin</p>
      <Link id="ssr-link" href="/ssr?tag=server" prefetch={false}>
        SSR data
      </Link>
      <Link id="ssg-link" href="/ssg?tag=static" prefetch={false}>
        SSG data
      </Link>
      <a id="public-link" href="/manual.txt">
        Public manual
      </a>
    </>
  )
}
