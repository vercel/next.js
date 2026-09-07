import { Suspense, type JSX } from 'react'
import { LinkAccordion } from '../components/link-accordion'

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>
}): JSX.Element {
  return (
    <>
      <Suspense>
        <UnenumeratedParamLink searchParams={searchParams} />
      </Suspense>
      <LinkAccordion href="/on-demand/built">Enumerated param</LinkAccordion>
    </>
  )
}

async function UnenumeratedParamLink({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>
}): Promise<JSX.Element | null> {
  const { slug } = await searchParams
  if (!slug) {
    return null
  }

  return (
    <LinkAccordion href={`/enumerated/${slug}`}>Never enumerated</LinkAccordion>
  )
}
