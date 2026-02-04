import { notFound } from 'next/navigation'

// avoid static generation to fill the dynamic params
export const dynamic = 'force-dynamic'

export default async function Page(props) {
  const params = await props.params

  const { id } = params

  if (id === '404') {
    notFound()
  }

  return <p id="page">{`dynamic [id]`}</p>
}
