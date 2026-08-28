import { getOrgAggregate, type OrgAggregate } from './db'
import { getCurrentUser } from './request-context'

// The org-wide aggregate is a full warehouse scan, so memoize it per
// dashboard section instead of paying for the scan on every render.
const memo = new Map<string, OrgAggregate>()

export async function getOrgInsights(section: string): Promise<OrgAggregate> {
  const cached = memo.get(section)
  if (cached) {
    return cached
  }
  const user = getCurrentUser()
  const aggregate = await getOrgAggregate(user.company)
  memo.set(section, aggregate)
  return aggregate
}
