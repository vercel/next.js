import { draftMode } from 'next/headers'
import { redirect } from 'next/navigation'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const draftModeState = await draftMode()
  if (url.searchParams.get('enabled') === '1') {
    draftModeState.enable()
  } else {
    draftModeState.disable()
  }
  redirect(url.searchParams.get('redirectTo') ?? '/article/a')
}
