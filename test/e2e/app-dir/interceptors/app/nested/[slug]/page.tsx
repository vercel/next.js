import { createTimeStamp, logWithTime, setTimeout } from '../../time-utils'

export default async function DeeplyNestedPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await logWithTime('DeeplyNestedPage', () => setTimeout(500))
  const { slug } = await params

  return (
    <form
      action={async () => {
        'use server'
        console.log('Action!')
      }}
    >
      <h3>{slug}</h3>
      <p suppressHydrationWarning>deeply nested page {createTimeStamp()}</p>
      <button>Submit</button>
    </form>
  )
}
