import { after } from 'next/server'
import { revalidateTimestampPage } from '../../timestamp/revalidate'
import { pathPrefix } from '../../path-prefix'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const data = { message: 'Hello, world!' }
  after(async () => {
    await revalidateTimestampPage(pathPrefix + `/route`)
  })

  return Response.json({ data })
}
