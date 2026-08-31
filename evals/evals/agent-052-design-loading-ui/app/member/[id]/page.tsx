import Link from 'next/link'
import { Activity } from './Activity'
import { Bio } from './Bio'
import { Related } from './Related'

export default async function MemberPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <main>
      <Link href="/">← Team directory</Link>
      <Bio id={id} />
      <Activity id={id} />
      <Related id={id} />
    </main>
  )
}
