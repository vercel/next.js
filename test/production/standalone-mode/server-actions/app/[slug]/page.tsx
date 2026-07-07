import { FormWithErrorBoundary } from './form'

export function generateStaticParams() {
  return [{ slug: 'world' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  return (
    <FormWithErrorBoundary
      action={async () => {
        'use server'
        return `hello ${slug}`
      }}
    />
  )
}
