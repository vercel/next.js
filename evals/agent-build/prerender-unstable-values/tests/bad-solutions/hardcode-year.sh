#!/bin/bash
# Rejected by: check-source.mjs. A literal year passes the build and sits in
# the HTML, but it goes stale in January.
set -euo pipefail
bash "$(dirname "$0")/_three-sites.sh"
cat > components/footer.tsx <<'EOF'
export function Footer() {
  return (
    <footer>
      <p>
        © 2026 Pulse · <a href="/status">System status</a>
      </p>
    </footer>
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
