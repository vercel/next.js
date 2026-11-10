import { LinkAccordion } from '../../components/link-accordion'
import { ClientRefreshButton } from './client'
import { refresh } from 'next/cache'

function ServerRefreshButton() {
  return (
    <form
      action={async () => {
        'use server'
        refresh()
      }}
    >
      <button id="server-refresh-button">Server refresh</button>
    </form>
  )
}

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
          <ServerRefreshButton />
        </div>
        <ul>
          <li>
            <LinkAccordion href="/dashboard">Dashboard Home</LinkAccordion>
          </li>
          <li>
            <LinkAccordion href="/dashboard/analytics">Analytics</LinkAccordion>
          </li>
          <li>
            <LinkAccordion href="/docs">Docs</LinkAccordion>
          </li>
        </ul>
      </div>
      <div>{main}</div>
    </div>
  )
}
