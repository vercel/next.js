#!/bin/bash
# Reference repair for nextjs/prerender-unstable-values.
#
# Each of the four sites takes a different branch of the error page:
# 1. Footer year: cache it, so marketing pages stay fully static.
# 2. "Checked at": capture the timestamp inside the cached data function so it
#    describes the fetch and is shared by every visitor until revalidation.
# 3. Relative time: defer the clock read to an effect behind a deterministic
#    server-rendered fallback.
# 4. Vendored SDK clock read: keep it out of the prerender with io(), which
#    suspends during prerendering without blocking prefetches.
set -euo pipefail

cat > components/footer.tsx <<'EOF'
import { cacheLife } from 'next/cache'

async function currentYear() {
  'use cache'
  cacheLife('days')
  return new Date().getFullYear()
}

export async function Footer() {
  const year = await currentYear()

  return (
    <footer>
      <p>
        © {year} Pulse · <a href="/status">System status</a>
      </p>
    </footer>
  )
}
EOF

node - <<'EOF'
const fs = require('node:fs')

let incidents = fs.readFileSync('lib/incidents.ts', 'utf8')
incidents = incidents.replace(
  'export async function getIncidents(): Promise<Incident[]> {',
  'export type StatusSnapshot = { incidents: Incident[]; checkedAt: string }\n\nexport async function getIncidents(): Promise<StatusSnapshot> {'
)
incidents = incidents.replace(
  '  return seed\n}',
  '  return { incidents: seed, checkedAt: new Date().toISOString() }\n}'
)
fs.writeFileSync('lib/incidents.ts', incidents)

let status = fs.readFileSync('app/status/page.tsx', 'utf8')
status = status.replace(
  '  const incidents = await getIncidents()\n  const checkedAt = new Date()\n',
  '  const { incidents, checkedAt: checkedAtIso } = await getIncidents()\n  const checkedAt = new Date(checkedAtIso)\n'
)
fs.writeFileSync('app/status/page.tsx', status)
EOF

cat > components/relative-time.tsx <<'EOF'
'use client'

import { useEffect, useState } from 'react'

const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
]

function describe(elapsedMs: number): string {
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  for (const [unit, size] of units) {
    if (Math.abs(elapsedMs) >= size) {
      return formatter.format(-Math.round(elapsedMs / size), unit)
    }
  }
  return 'just now'
}

export function RelativeTime({ since }: { since: string }) {
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    const update = () => setNow(Date.now())
    update()
    const interval = window.setInterval(update, 30_000)
    return () => window.clearInterval(interval)
  }, [])

  const absolute = since.replace('T', ' ').slice(0, 16) + ' UTC'

  return (
    <time dateTime={since} data-testid="relative-time">
      {now === null ? absolute : describe(now - new Date(since).getTime())}
    </time>
  )
}
EOF

cat > lib/customers.ts <<'EOF'
import { io } from 'next/cache'
import { cookies } from 'next/headers'
import { createCustomerClient, type Customer } from '@/lib/vendor/customer-sdk'

export const CUSTOMER_COOKIE = 'pulse_customer'

export async function getCurrentCustomer(): Promise<Customer | null> {
  const id = (await cookies()).get(CUSTOMER_COOKIE)?.value
  if (!id) return null

  // The SDK stamps request timing with Date.now(); keep it out of the prerender.
  await io()
  return createCustomerClient().getCustomer(id)
}
EOF

npm run typecheck
