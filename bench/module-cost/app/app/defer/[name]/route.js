// Next.js route.js

import { deferCases } from '../../../../lib/defer-cases'
import { measure } from '../../../../lib/measure'

export async function GET(request, { params }) {
  const { name } = await params
  const load = deferCases[name]
  if (!load) {
    return Response.json({ error: `Unknown case ${name}` }, { status: 404 })
  }
  const result = await measure(`app route ${name}`, load)

  return Response.json(result)
}
