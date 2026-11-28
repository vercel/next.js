import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <main id="home-page">
      <ul>
        <li>
          <LinkAccordion href="/target">Target page</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/export?variant=auto" download="report.csv">
            Download CSV
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion
            href="/export?variant=full"
            download="report.csv"
            prefetch={true}
          >
            Download CSV (prefetch=true)
          </LinkAccordion>
        </li>
      </ul>
    </main>
  )
}
