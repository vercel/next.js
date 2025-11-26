import { LinkAccordion } from './components/link-accordion'

export default function Page() {
  return (
    <div id="home-page">
      <LinkAccordion href="/0" prefetch={true}>
        To Dynamic Page
      </LinkAccordion>
    </div>
  )
}
