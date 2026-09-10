import type { JSX } from 'react'
import { lang } from 'next/root-params'
import { LinkAccordion } from '../link-accordion'

export default async function Page(): Promise<JSX.Element> {
  return <LinkAccordion href={`/${await lang()}/prefetched`} />
}
