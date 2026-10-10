// A `.node` addon is not placeable in an ECMAScript chunk, so it has no
// bindings to read. Reading one must be reported, not silently be `undefined`.
// @ts-expect-error -- untyped native addon
import * as ns from '../../../lib/fake.node'

export function GET() {
  return Response.json({ type: typeof ns })
}
