import Link from 'next/link'
import { Text } from 'esm-client-component'

export default function Nav() {
  return (
    <>
      <div>
        <Text text={`nav-title`} />
      </div>
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
        <Link href={'/'}>
          <a id="goto-home">home</a>
        </Link>
      </div>
    </>
  )
}
