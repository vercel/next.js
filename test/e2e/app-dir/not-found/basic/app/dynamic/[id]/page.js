import { notFound } from 'next/navigation'

// avoid static generation to fill the dynamic params
export const dynamic = 'force-dynamic'

export default function Page() {
  notFound()

  return <>{`dynamic [id]`}</>
}
