import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params

  if (id === '404' || id === '999') {
    notFound()
  }

  return <p id="page">Dynamic page: {id}</p>
}
