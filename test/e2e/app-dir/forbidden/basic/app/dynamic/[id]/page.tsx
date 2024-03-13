import { forbidden } from 'next/navigation'

// avoid static generation to fill the dynamic params
export const dynamic = 'force-dynamic'

export default function Page({ params: { id } }) {
  if (id === '403') {
    forbidden()
  }

  return <p id="page">{`dynamic [id]`}</p>
}
