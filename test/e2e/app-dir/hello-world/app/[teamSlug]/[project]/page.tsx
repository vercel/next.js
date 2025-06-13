
import type { Metadata } from 'next'
import { Suspense } from 'react'

export const experimental_ppr = true

export const generateMetadata = async (props: any): Promise<Metadata> => {
  const params = await props.params
  return {
    title: {
      template: `${params.project} – %s – Vercel`,
      default: `${params.project} - Overview`,
    },
  }
}

async function Suspend({ params }: any) {
  ;(await params).teamSlug

  return 'Hello, Dave!'
}

export default function ProjectOverviewLayout({ params }) {
  return (
    <Suspense>
      <Suspend params={params} />
    </Suspense>
  )
}
