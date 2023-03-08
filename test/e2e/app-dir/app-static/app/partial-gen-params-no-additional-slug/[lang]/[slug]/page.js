export const dynamicParams = false

export async function generateStaticParams() {
  const res = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?staticGen'
  )

  const data = await res.text()
  const fetchSlug = Math.round(Number(data) * 100)
  console.log('partial-gen-params fetch', fetchSlug)

  return [
    {
      slug: 'first',
    },
    {
      slug: 'second',
    },
    {
      slug: fetchSlug + '',
    },
  ]
}

export default function Page({ params }) {
  return (
    <>
      <p id="page">/partial-gen-params/[lang]/[slug]</p>
      <p id="params">{JSON.stringify(params)}</p>
    </>
  )
}
