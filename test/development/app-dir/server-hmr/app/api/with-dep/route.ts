import { depMessage, depEvaluatedAt } from './dep'

const routeEvaluatedAt = Date.now()
const routeVersion = 'v1'

export async function GET() {
  return Response.json({
    depMessage,
    depEvaluatedAt,
    routeEvaluatedAt,
    routeVersion,
  })
}
