import { Suspense } from 'react'
import { LinkAccordion } from '../link-accordion'

type Props = {
  searchParams: Promise<{ target?: string | string[] }>
}

async function Target({ searchParams }: Props) {
  const { target } = await searchParams
  if (typeof target !== 'string') {
    throw new Error('Expected a single navigation target')
  }
  return <LinkAccordion href={target} />
}

export default function Page(props: Props) {
  return (
    <Suspense fallback="Loading link...">
      <Target {...props} />
    </Suspense>
  )
}
