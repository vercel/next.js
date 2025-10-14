export const dynamic = 'force-static'

export function generateStaticParams() {
  return [{ slug: 'first' }]
}

export default async function Page({ params }) {
  const { slug } = await params
  return (
    <>
      <p>/isr-app/[slug]</p>
      <p>now: {Date.now()}</p>
      <p>slug: {slug}</p>
    </>
  )
}
