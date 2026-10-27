#!/bin/bash
# Rejected by: behavior.spec.ts. Moving the year and the checked-at time into
# client effects makes the build pass, but the server HTML no longer contains
# either value, and "Checked at" becomes the visitor's clock instead of the
# fetch time.
set -euo pipefail
bash "$(dirname "$0")/_three-sites.sh"

cat > components/footer.tsx <<'EOF'
'use client'

import { useEffect, useState } from 'react'

export function Footer() {
  const [year, setYear] = useState<number | null>(null)
  useEffect(() => setYear(new Date().getFullYear()), [])

  return (
    <footer>
      <p>
        © {year ?? ''} Pulse · <a href="/status">System status</a>
      </p>
    </footer>
  )
}
EOF

cat > components/checked-at.tsx <<'EOF'
'use client'

import { useEffect, useState } from 'react'

export function CheckedAt() {
  const [stamp, setStamp] = useState<string | null>(null)
  useEffect(() => {
    setStamp(new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC')
  }, [])

  return (
    <p data-testid="checked-at">
      Checked at {stamp ?? '…'}
    </p>
  )
}
EOF

node - <<'EOF'
const fs = require('node:fs')
let status = fs.readFileSync('app/status/page.tsx', 'utf8')
status = status.replace(
  "import { getIncidents } from '@/lib/incidents'",
  "import { getIncidents } from '@/lib/incidents'\nimport { CheckedAt } from '@/components/checked-at'"
)
status = status.replace(
  /      <p data-testid="checked-at">[\s\S]*?<\/p>\n/,
  '      <CheckedAt />\n'
)
status = status.replace(
  '  const checkedAt = new Date(checkedAtIso)\n',
  ''
)
status = status.replace('checkedAt: checkedAtIso', 'checkedAt: _checkedAt')
fs.writeFileSync('app/status/page.tsx', status)
EOF

cat > lib/customers.ts <<'EOF'
import { io } from 'next/cache'
import { cookies } from 'next/headers'
import { createCustomerClient, type Customer } from '@/lib/vendor/customer-sdk'

export const CUSTOMER_COOKIE = 'pulse_customer'

export async function getCurrentCustomer(): Promise<Customer | null> {
  const id = (await cookies()).get(CUSTOMER_COOKIE)?.value
  if (!id) return null
  await io()
  return createCustomerClient().getCustomer(id)
}
EOF
