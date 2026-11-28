import Link from 'next/link'

export default async function Page(
  props: PageProps<'/loading-above-segment/dynamic/[id]'>
) {
  const { id } = await props.params
  if (id !== '1') {
    await new Promise((resolve) => setTimeout(resolve, 5000))
  }
  return (
    <>
      <div id="dynamic-page">{id}</div>
      {
        // Repeat 500 elements
        Array.from({ length: 500 }, (_, i) => (
          <div key={i}>{i}</div>
        ))
      }
      <Link href="/loading-above-segment/dynamic/2" id="to-dynamic-2">
        To dynamic 2
      </Link>
    </>
  )
}
