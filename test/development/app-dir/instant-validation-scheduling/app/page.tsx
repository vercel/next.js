import { LinkAccordion } from './components/link-accordion'

export default function Page() {
  return (
    <main>
      <h1>Document B hub</h1>
      <LinkAccordion href="/routes/a" prefetch={false}>
        Navigate to A
      </LinkAccordion>
      <LinkAccordion href="/routes/b" prefetch={false}>
        Navigate to B
      </LinkAccordion>
    </main>
  )
}
