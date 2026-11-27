import { LinkAccordion } from '../components/link-accordion'

// The only link on this page is hidden until the test reveals it, so the test
// controls exactly when the prefetch happens.
export default function Page() {
  return (
    <div id="prefetch-full-page-start">
      <LinkAccordion href="/prefetch-full-page/destination" prefetch={true}>
        To destination - prefetch: true
      </LinkAccordion>
    </div>
  )
}
