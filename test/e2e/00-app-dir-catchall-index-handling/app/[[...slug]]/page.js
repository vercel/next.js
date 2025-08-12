import Link from 'next/link'

const Page = ({ params }) => {
  return (
    <div>
      <div id="page-param">page-param-{params.slug?.[0] ?? ''}</div>
      <Link href="/">Home</Link>
      <Link href="/foo">Foo</Link>
      <Link href="/bar">Bar</Link>
    </div>
  )
}

export default Page
