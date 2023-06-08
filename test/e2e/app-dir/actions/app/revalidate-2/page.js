import { revalidateTag } from 'next/cache'
import Link from 'next/link'

export default async function Page() {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?page',
    {
      next: { revalidate: 3600, tags: ['thankyounext'] },
    }
  ).then((res) => res.text())

  return (
    <>
      <h1 id="title">another route</h1>
      <Link href="/revalidate" id="back">
        Back
      </Link>
      <p>
        {' '}
        revalidate (tags: thankyounext): <span id="thankyounext">{data}</span>
      </p>
      <form>
        <button
          id="revalidate-tag"
          formAction={async () => {
            'use server'
            revalidateTag('thankyounext')
          }}
        >
          revalidate thankyounext
        </button>
      </form>
    </>
  )
}
