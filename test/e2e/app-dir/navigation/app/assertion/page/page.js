import { strict as assert } from 'node:assert'
import Link from 'next/link'
import { NEXT_RSC_UNION_QUERY } from 'next/dist/client/components/app-router-headers'

export default async function Page({ searchParams }) {
  const rscUnionQuery = (await searchParams)[NEXT_RSC_UNION_QUERY]
  assert(rscUnionQuery === undefined)

  return (
    <>
      <p>no rsc query page</p>
      return{' '}
      <Link id="link-to-pages" href="/some">
        To /some
      </Link>
    </>
  )
}
