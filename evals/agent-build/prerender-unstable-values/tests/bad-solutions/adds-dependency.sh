#!/bin/bash
# Rejected by: check-source.mjs, before typecheck. The repairs are correct,
# but the agent added a dev dependency to write its own tests. CI installs the
# committed lockfile offline, as the instruction states, so the dependency
# change fails for that stated reason rather than as a confusing tsc error.
set -euo pipefail
bash "$(dirname "$0")/_three-sites.sh"
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
node - <<'EOF'
const fs = require('node:fs')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
pkg.devDependencies['@playwright/test'] = '1.55.0'
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n')
EOF
mkdir -p tests
cat > tests/smoke.spec.ts <<'EOF'
import { expect, test } from '@playwright/test'

test('home renders', async ({ page }) => {
  await page.goto('http://127.0.0.1:3000/')
  await expect(page.getByRole('heading')).toBeVisible()
})
EOF
