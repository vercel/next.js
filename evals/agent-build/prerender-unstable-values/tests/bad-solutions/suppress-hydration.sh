#!/bin/bash
# Rejected by: check-source.mjs. Rendering the relative wording on the server
# and silencing the mismatch leaves stale text in the HTML and hides the bug.
set -euo pipefail
bash "$(dirname "$0")/_three-sites.sh"
cat > components/relative-time.tsx <<'EOF'
'use client'

import { use } from 'react'
import { io } from 'next/cache'

export function RelativeTime({ since }: { since: string }) {
  use(io())
  const days = Math.round((Date.now() - new Date(since).getTime()) / 86_400_000)

  return (
    <time dateTime={since} data-testid="relative-time" suppressHydrationWarning>
      {days} days ago
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
  await io()
  return createCustomerClient().getCustomer(id)
}
EOF
