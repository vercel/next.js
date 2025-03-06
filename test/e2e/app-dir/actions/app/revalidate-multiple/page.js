import { unstable_expireTag } from 'next/cache'

export default async function Page() {
  const data1 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?a',
    {
      next: { tags: ['thankyounext'] },
    }
  ).then((res) => res.text())

  const data2 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?b',
    {
      next: { tags: ['justputit'] },
    }
  ).then((res) => res.text())

  return (
    <>
      <h1 id="title">another route</h1>
      <p>
        revalidate (tags: thankyounext): <span id="thankyounext">{data1}</span>
      </p>
      <p>
        revalidate (tags: justputit): <span id="justputit">{data2}</span>
      </p>
      <form>
        <button
          id="revalidate"
          formAction={async () => {
            'use server'
            unstable_expireTag('thankyounext')
            unstable_expireTag('justputit')
          }}
        >
          revalidate thankyounext
        </button>
      </form>
    </>
  )
}
