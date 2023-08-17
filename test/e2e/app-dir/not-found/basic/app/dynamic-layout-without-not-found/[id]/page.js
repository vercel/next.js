import { notFound } from 'next/navigation'

// avoid static generation to fill the dynamic params
export const dynamic = 'force-dynamic'

export default function Page({ params: { id } }) {
  if (id === '404') {
    notFound()
  }

  return <p id="page">{`dynamic-layout-without-not-found [id]`}</p>
}
