import { nanoid } from 'nanoid'
import Link from 'next/link'

export default function Page() {
  return (
    <>
      <h1 id="render-id">{nanoid()}</h1>
      <Link href="/link-hard-replace" replace>
        <a id="self-link">Self Link</a>
      </Link>
      <Link href="/link-hard-replace/subpage" replace>
        <a id="subpage-link">Subpage</a>
      </Link>
    </>
  )
}
