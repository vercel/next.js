#!/bin/bash
# Rejected by: behavior.spec.ts. Making every clock read request-time (behind
# Suspense so the build passes) keeps the build green, but the footer year
# and "Checked at" drop out of the static HTML, and "Checked at" changes on
# every request instead of describing the cached fetch.
set -euo pipefail

cat > components/footer.tsx <<'EOF'
import { connection } from 'next/server'

export async function Footer() {
  await connection()
  const year = new Date().getFullYear()

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

let layout = fs.readFileSync('app/layout.tsx', 'utf8')
layout = layout.replace(
  "import Link from 'next/link'",
  "import Link from 'next/link'\nimport { Suspense } from 'react'"
)
layout = layout.replace(
  '        <Footer />',
  '        <Suspense fallback={null}>\n          <Footer />\n        </Suspense>'
)
fs.writeFileSync('app/layout.tsx', layout)

let status = fs.readFileSync('app/status/page.tsx', 'utf8')
status = status.replace(
  "import { getIncidents } from '@/lib/incidents'",
  "import { Suspense } from 'react'\nimport { connection } from 'next/server'\nimport { getIncidents } from '@/lib/incidents'"
)
status = status.replace(
  '  const incidents = await getIncidents()\n  const checkedAt = new Date()\n',
  '  const incidents = await getIncidents()\n'
)
status = status.replace(
  /      <p data-testid="checked-at">[\s\S]*?<\/p>\n/,
  '      <Suspense fallback={<p data-testid="checked-at">Checked at …</p>}>\n        <CheckedAt />\n      </Suspense>\n'
)
status += `
async function CheckedAt() {
  await connection()
  const checkedAt = new Date()
  return (
    <p data-testid="checked-at">
      Checked at{' '}
      <time dateTime={checkedAt.toISOString()}>
        {checkedAt.toISOString().replace('T', ' ').slice(0, 19)} UTC
      </time>
    </p>
  )
}
`
fs.writeFileSync('app/status/page.tsx', status)
EOF

cat > components/relative-time.tsx <<'EOF'
'use client'

import { useEffect, useState } from 'react'

export function RelativeTime({ since }: { since: string }) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => setNow(Date.now()), [])
  const absolute = since.replace('T', ' ').slice(0, 16) + ' UTC'
  const days =
    now === null ? null : Math.round((now - new Date(since).getTime()) / 86_400_000)

  return (
    <time dateTime={since} data-testid="relative-time">
      {days === null ? absolute : `${days} days ago`}
    </time>
  )
}
EOF

cat > lib/customers.ts <<'EOF'
import { connection } from 'next/server'
import { cookies } from 'next/headers'
import { createCustomerClient, type Customer } from '@/lib/vendor/customer-sdk'

export const CUSTOMER_COOKIE = 'pulse_customer'

export async function getCurrentCustomer(): Promise<Customer | null> {
  const id = (await cookies()).get(CUSTOMER_COOKIE)?.value
  if (!id) return null
  await connection()
  return createCustomerClient().getCustomer(id)
}
EOF
