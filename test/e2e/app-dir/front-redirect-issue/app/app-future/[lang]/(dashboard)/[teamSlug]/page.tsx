import { redirect, notFound } from 'next/navigation'

export default async function TeamDashboardPage({ params }: any) {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  const username = 'vercel-user'
  if (params.teamSlug === username) {
    return redirect('/')
  }

  return notFound()
}

export const dynamicParams = true

export async function generateMetadata() {
  return {
    title: 'test',
  }
}
