import { getUserBilling } from './db'
import type { Session } from './session'

// Billing summaries are slow to assemble, so cache them. The session is part
// of the arguments, which keeps every user's summary under its own cache key.
export async function getAccountSummary(session: Session) {
  'use cache'
  const billing = await getUserBilling(session.userId)
  return {
    plan: billing.plan,
    billingEmail: billing.billingEmail,
    company: session.company,
  }
}
