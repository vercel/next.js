import { Suspense } from 'react'
import Link from 'next/link'
import { LinkAccordion } from '../../../../components/link-accordion'

async function Links({
  params,
}: {
  params: Promise<{ team: string; region: string }>
}) {
  const { team, region } = await params
  const prefix = `/${team}/${region}/many/one/two/three/four/five/six/seven/eight`

  return (
    <>
      <Link href={`${prefix}/nine?term=kept`} prefetch={false}>
        Navigate without prefetching
      </Link>
      <LinkAccordion href={`${prefix}/prefetched?term=kept`} />
    </>
  )
}

export default function Page({
  params,
}: {
  params: Promise<{ team: string; region: string }>
}) {
  return (
    <Suspense fallback={<p>Loading links</p>}>
      <Links params={params} />
    </Suspense>
  )
}
