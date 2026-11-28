export const dynamic = 'force-dynamic'

export function GET() {
  // Required lazily so that the build doesn't evaluate it.
  const value = require('traced-parent')
  return Response.json({ value })
}
