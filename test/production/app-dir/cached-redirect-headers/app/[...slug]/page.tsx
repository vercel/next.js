import { permanentRedirect, redirect } from 'next/navigation'

export const dynamic = 'force-static'

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params

  if (slug[0] === 'temporary') {
    redirect('/destination')
  }

  permanentRedirect('/destination')
}
