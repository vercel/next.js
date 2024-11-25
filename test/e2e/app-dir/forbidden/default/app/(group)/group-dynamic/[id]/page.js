import { forbidden } from 'next/navigation'

export default async function Page(props) {
  const params = await props.params
  if (params.id === '403') {
    forbidden()
  }

  return <p id="page">{`group-dynamic [id]`}</p>
}
