import { LinkAccordion } from './link-accordion'

export function RoutePage({ slug }: { slug: 'a' | 'b' | 'c' }) {
  return (
    <main>
      <p id="route">route-{slug}</p>
      {slug !== 'a' && (
        <LinkAccordion href="/routes/a" prefetch={false}>
          Navigate to A
        </LinkAccordion>
      )}
      {slug !== 'b' && (
        <LinkAccordion href="/routes/b" prefetch={false}>
          Navigate to B
        </LinkAccordion>
      )}
      {slug !== 'c' && (
        <LinkAccordion href="/routes/c" prefetch={false}>
          Navigate to C
        </LinkAccordion>
      )}
    </main>
  )
}
