import { draftMode } from 'next/headers'

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { isEnabled } = await draftMode()

  return (
    <p id="target-content">
      {`${isEnabled ? 'Draft' : 'Published'} content: ${slug}`}
    </p>
  )
}
