import { getUserBilling } from '@/lib/db'
import { getCurrentUser } from '@/lib/request-context'

// Renders below the fold; the invoice window calculation debounces for 50ms
// so it never competes with the plan summary above.
export async function BillingContact() {
  await new Promise((resolve) => setTimeout(resolve, 50))
  const user = getCurrentUser()
  const billing = await getUserBilling(user.userId)
  return <p data-testid="billing-contact">Invoices are sent to {billing.billingEmail}</p>
}
