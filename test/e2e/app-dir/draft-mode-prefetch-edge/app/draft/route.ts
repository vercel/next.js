import { draftMode } from 'next/headers'
import { redirect } from 'next/navigation'

export const runtime = 'edge'

export async function GET(request: Request) {
  const draft = await draftMode()
  draft.enable()
  redirect(new URL(request.url).searchParams.has('error') ? '/error' : '/')
}
