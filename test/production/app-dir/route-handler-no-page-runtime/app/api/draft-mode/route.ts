import { draftMode } from 'next/headers'

export async function GET() {
  const { isEnabled } = await draftMode()
  return Response.json(isEnabled)
}
