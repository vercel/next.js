import { updateTag } from 'next/cache'
import { cookies } from 'next/headers'
import Link from 'next/link'

export default async function Page() {
  const randomCookie = (await cookies()).get('random')
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
            updateTag('thankyounext')
          }}
        >
          revalidate thankyounext
        </button>
      </form>
      <p>
        random cookie:{' '}
        <span id="random-cookie">
          {JSON.stringify({ cookie: randomCookie })}
        </span>
      </p>
    </>
  )
}
