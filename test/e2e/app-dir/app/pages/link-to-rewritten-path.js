import Link from 'next/link'

export default function Page(props) {
  return (
    <>
      <Link href="/exists-but-not-routed" id="link-to-rewritten-path">
        Exists but not routed
      </Link>
    </>
  )
}
