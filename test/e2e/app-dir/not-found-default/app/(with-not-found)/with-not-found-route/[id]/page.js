import { notFound } from 'next/navigation'

export default async function Page(props) {
  const params = await props.params
  if (params.id === 'missing') {
    notFound()
  }
  return <p id="with-not-found-page">{`with-not-found-route [id]`}</p>
}
