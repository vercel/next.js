import { unauthorized } from 'next/navigation'

export default async function Page(props) {
  const params = await props.params

  const { id } = params

  if (id === '401') {
    unauthorized()
  }

  return <p id="page">{`dynamic [id]`}</p>
}
