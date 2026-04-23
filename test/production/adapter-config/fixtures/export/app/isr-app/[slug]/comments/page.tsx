export function generateStaticParams() {
  return [{ slug: 'first' }]
}

export default function Page() {
  return (
    <>
      <p>/isr-app/[slug]/comments</p>
      <p>now: static</p>
    </>
  )
}
