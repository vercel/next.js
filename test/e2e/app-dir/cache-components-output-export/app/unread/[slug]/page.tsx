import { LinkAccordion } from '../../../components/link-accordion'

export function generateStaticParams() {
  return [{ slug: 'known' }]
}

export default function Page() {
  return (
    <main>
      <p id="unread">A generated route that does not read params</p>
      <LinkAccordion href="/unread/unknown" prefetch={false}>
        Ungenerated sibling
      </LinkAccordion>
    </main>
  )
}

export const unstable_paramMatching = { slug: 'not-found' } as const
