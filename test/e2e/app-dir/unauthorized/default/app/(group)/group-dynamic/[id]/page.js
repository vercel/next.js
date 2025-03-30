import { unauthorized } from 'next/navigation'

export default async function Page(props) {
  const params = await props.params
  if (params.id === '401') {
    unauthorized()
  }

  return <p id="page">{`group-dynamic [id]`}</p>
}
