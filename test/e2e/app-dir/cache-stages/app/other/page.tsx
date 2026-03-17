import { LinkAccordion } from '../../components/link-accordion'

export default function OtherPage() {
  return (
    <main>
      <h1>Other Page</h1>
      <p>Navigate back to the target page using the link accordion below.</p>
      <div>
        <LinkAccordion href="/target-page?q=test">
          Back to target page
        </LinkAccordion>
      </div>
    </main>
  )
}
