import {
  activity,
  deployments,
  domains,
  members,
  projects,
  usageSeries,
} from '../../lib/data'

// Route handler workload: a list endpoint with a body in the tens of KB,
// serialized on every request like a handler that just read from a database.
export function GET() {
  return Response.json({
    deployments,
    projects,
    domains,
    members,
    activity,
    usageSeries,
  })
}

export const dynamic = 'force-dynamic'
