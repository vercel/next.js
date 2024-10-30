import { revalidateTag } from 'next/cache'

export default async function Page() {
  const data1 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?a',
    {
      next: { revalidate: 3600, tags: ['thankyounext'] },
    }
  ).then((res) => res.text())

  const data2 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?b',
    {
      next: { revalidate: 3600, tags: ['justputit'] },
    }
  ).then((res) => res.text())

  const data3 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?c',
    {
      next: { revalidate: 3600, tags: ['yougotit'] },
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
      <p>
        revalidate (tags: yougotit): <span id="yougotit">{data3}</span>
      </p>
      <form>
        <button
          id="revalidate"
          formAction={async () => {
            'use server'
            revalidateTag('thankyounext', 'justputit')
          }}
        >
          revalidate
        </button>
      </form>
    </>
  )
}
