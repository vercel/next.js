import { LinkAccordion } from './components/link-accordion'

export default function Page() {
  return (
    <main id="home">
      <p>Home</p>
      <LinkAccordion href="/protected" prefetch={false}>
        Visit protected page
      </LinkAccordion>
      <LinkAccordion href="/blog?category=invalid" prefetch={false}>
        Visit invalid blog category
      </LinkAccordion>
    </main>
  )
}
