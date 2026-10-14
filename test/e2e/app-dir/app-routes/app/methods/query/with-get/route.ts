export { QUERY } from '../../../../handlers/query'

// Without QUERY, this GET handler would be prerendered.
export const revalidate = 1

export async function GET() {
  return Response.json({ now: Date.now() })
}
