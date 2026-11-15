import type { Metadata } from 'next'
import { connection } from 'next/server'
import { LinkAccordion } from '../../components/link-accordion'

export const metadata: Metadata = {
  title: 'Shared title',
}

// A dynamic layout that stays mounted while navigating between its children.
export default async function SharedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await connection()
  return (
    <>
      <ul>
        <li>
          <LinkAccordion href="/shared/destination">Destination</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/shared/destination/detail">
            Detail
          </LinkAccordion>
        </li>
      </ul>
      <div>{children}</div>
    </>
  )
}
