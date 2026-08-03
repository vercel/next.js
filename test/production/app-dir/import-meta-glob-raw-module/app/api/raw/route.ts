// @ts-expect-error -- a `raw` module has no exports
import * as ns from '../../../content/alpha.md'

export function GET() {
  return Response.json({ type: typeof ns })
}
