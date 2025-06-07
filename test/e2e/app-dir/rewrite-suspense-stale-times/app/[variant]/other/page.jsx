import Link from 'next/link'

export const revalidate = 0

export default function Page() {
  return (
    <>
      <div id="other-page">Other Page</div>

      <Link id="link-to-home-page" href="/">
        To to home page
      </Link>
    </>
  )
}
