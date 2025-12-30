import { forbidden, notFound, unauthorized } from 'next/navigation'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string }>
}) {
  const search = await searchParams
  switch (search.name) {
    case 'not-found':
      return notFound()
    case 'forbidden':
      return forbidden()
    case 'unauthorized':
      return unauthorized()
    default:
      break
  }
  return <p>{'Visit /boundary?name=<boundary>'}</p>
}
