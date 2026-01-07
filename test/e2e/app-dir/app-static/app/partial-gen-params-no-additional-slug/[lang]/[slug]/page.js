export const dynamicParams = false
export const fetchCache = 'default-cache'

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

export default async function Page(props) {
  const params = await props.params
  return (
    <>
      <p id="page">/partial-gen-params/[lang]/[slug]</p>
      <p id="params">{JSON.stringify(params)}</p>
    </>
  )
}
