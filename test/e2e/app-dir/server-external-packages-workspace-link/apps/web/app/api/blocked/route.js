import * as blocked from 'my-blocked-pkg'
import { stub } from 'my-blocked-pkg/redirected'

export async function GET() {
  return Response.json({ blocked: typeof blocked, stub })
}
