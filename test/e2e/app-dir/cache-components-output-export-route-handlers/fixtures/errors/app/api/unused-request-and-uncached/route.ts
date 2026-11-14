import { headers } from 'next/headers'

export async function GET() {
  headers()
  const response = await fetch(`${process.env.CC_EXPORT_DATA_URL}/data`, {
    cache: 'no-store',
  })
  return Response.json(await response.json())
}
