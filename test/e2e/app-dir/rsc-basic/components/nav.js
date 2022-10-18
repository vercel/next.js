import Link from 'next/link'

export default function Nav() {
  return (
    <>
      <div>
        <Link href={'/next-api/link'} id="goto-next-link">
          next link
        </Link>
      </div>
      <div>
        <Link href={'/streaming-rsc'} id="goto-streaming-rsc">
          streaming rsc
        </Link>
      </div>
      <div>
        <Link href={'/root'} id="goto-home">
          home
        </Link>
      </div>
    </>
  )
}
