import { forbidden } from 'next/navigation'

// avoid static generation to fill the dynamic params
export const dynamic = 'force-dynamic'

export default async function Page(props) {
  const params = await props.params

  const { id } = params

  if (id === '403') {
    forbidden()
  }

  return <p id="page">{`dynamic-layout-without-forbidden [id]`}</p>
}
