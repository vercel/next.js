import Link from 'next/link'

export default function Nav() {
  return (
    <>
      <div>
        <Link href={'/next-api/link'}>
          <a id="goto-next-link">next link</a>
        </Link>
      </div>
      <div>
        <Link href={'/streaming-rsc'}>
          <a id="goto-streaming-rsc">streaming rsc</a>
        </Link>
      </div>
      <div>
        <Link href={'/root'}>
          <a id="goto-home">home</a>
        </Link>
      </div>
    </>
  )
}
