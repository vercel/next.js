import { unauthorized } from 'next/navigation'

// avoid static generation to fill the dynamic params
export const dynamic = 'force-dynamic'

export default async function Page(props) {
  const params = await props.params

  const { id } = params

  if (id === '401') {
    unauthorized()
  }

  return <p id="page">{`group-dynamic [id]`}</p>
}
