import { Suspense } from 'react'
import { LinkAccordion } from '../link-accordion'

type Props = {
  searchParams: Promise<{
    target?: string | string[]
    sibling?: string | string[]
    prefetch?: string | string[]
  }>
}

async function Target({ searchParams }: Props) {
  const { target, sibling, prefetch } = await searchParams
  if (typeof target !== 'string') {
    throw new Error('Expected a single navigation target')
  }
  return (
    <>
      <LinkAccordion href={target} prefetch={prefetch === 'true'} />
      {typeof sibling === 'string' ? (
        <LinkAccordion id="sibling" href={sibling} prefetch />
      ) : null}
    </>
  )
}

export default function Page(props: Props) {
  return (
    <Suspense fallback="Loading link...">
      <Target {...props} />
    </Suspense>
  )
}
