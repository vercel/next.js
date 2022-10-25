import { notFound } from 'next/navigation'

export const dynamicParams = true

export default function Page({ params }) {
  if (params.author === 'shu') {
    notFound()
  }

  return (
    <>
      <p id="page">/blog/[author]/[slug]</p>
      <p id="params">{JSON.stringify(params)}</p>
      <p id="date">{Date.now()}</p>
    </>
  )
}

export function generateStaticParams({ params }) {
  console.log(
    '/blog/[author]/[slug] generateStaticParams',
    JSON.stringify(params)
  )

  switch (params.author) {
    case 'tim': {
      return [
        {
          slug: 'first-post',
        },
      ]
    }
    case 'seb': {
      return [
        {
          slug: 'second-post',
        },
      ]
    }
    case 'styfle': {
      return [
        {
          slug: 'first-post',
        },
        {
          slug: 'second-post',
        },
      ]
    }
    default: {
      throw new Error(`unexpected author param received ${params.author}`)
    }
  }
}
