import { permanentRedirect } from 'next/navigation'

export async function GET() {
  permanentRedirect('https://nextjs.org/')
}
