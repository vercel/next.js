import { redirect, notFound } from 'next/navigation'
// http://localhost:3000/app-future/en/timvercel
export default async function TeamDashboardPage({ params }) {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  const username = 'timvercel'
  if (params.teamSlug === username) {
    console.log('REDIRECT?!')
    return redirect('/')
  }

  return notFound()

  return 'Page!'
}

export const dynamicParams = true

export async function generateMetadata({
  params,
}: {
  params: {
    teamSlug: string
  }
}) {
  return {
    title: 'test',
  }
}
