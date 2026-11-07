import { LinkAccordion } from '../../components/link-accordion'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <ul>
        <li>
          <LinkAccordion href="/abandoned-navigation/slow?error-status=503">
            Slow page
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/abandoned-navigation/other">
            Other page
          </LinkAccordion>
        </li>
      </ul>
      {children}
    </div>
  )
}
