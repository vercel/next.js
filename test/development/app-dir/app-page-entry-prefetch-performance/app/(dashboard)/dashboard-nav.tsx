'use client'

import Link from 'next/link'

const navigation = [
  ['Overview', '/'],
  ['Agent Inbox', '/agent-inbox'],
  ['Contacts', '/contacts'],
  ['Emails', '/emails'],
  ['Templates', '/templates'],
  ['Workflows', '/workflows'],
  ['Metrics', '/metrics'],
  ['Logs', '/logs'],
  ['API Keys', '/api-keys'],
  ['Domain', '/domain'],
  ['Webhooks', '/webhooks'],
  ['Integrations', '/integrations'],
  ['SMTP', '/smtp'],
  ['Settings', '/settings'],
] as const

export function DashboardNav() {
  return (
    <nav>
      {navigation.map(([label, href]) => (
        <Link key={href} href={href}>
          {label}
        </Link>
      ))}
    </nav>
  )
}
