import { LinkAccordion } from '../../components/link-accordion'
import { ClientRefreshButton } from './client'

export default function DashboardLayout({
  navbar,
  main,
}: {
  navbar: React.ReactNode
  main: React.ReactNode
}) {
  return (
    <div>
      <div style={{ border: '1px solid black', padding: '1rem' }}>
        {navbar}
        <div>
          <ClientRefreshButton />
        </div>
        <ul>
          <li>
            <LinkAccordion href="/dashboard">Dashboard Home</LinkAccordion>
          </li>
          <li>
            <LinkAccordion href="/dashboard/analytics">Analytics</LinkAccordion>
          </li>
        </ul>
      </div>
      <div>{main}</div>
    </div>
  )
}
