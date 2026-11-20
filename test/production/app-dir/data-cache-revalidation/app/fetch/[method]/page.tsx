import Expire from '../../expire'

export function generateStaticParams() {
  return [{ method: 'get' }, { method: 'post' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ method: string }>
}) {
  const { method } = await params
  const response = await fetch(
    `https://next-data-api-endpoint.vercel.app/api/random?data-cache-revalidation=fetch-${method}`,
    { method: method.toUpperCase(), next: { revalidate: 3600 } }
  )
  const value = await response.text()

  return (
    <>
      <Expire />
      <p id="value">{value}</p>
    </>
  )
}
