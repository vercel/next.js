import Link from 'next/link'

export function generateStaticParams() {
  return [{ rootParam: 'foo' }, { rootParam: 'bar' }]
}

export default async function Page(props: {
  params: Promise<{ rootParam: string }>
}) {
  const { rootParam } = await props.params
  const otherRootParam = rootParam === 'foo' ? 'bar' : 'foo'
  return (
    <>
      <p>
        <p>
          This link <em>should not</em> trigger an MPA navigation, because it
          only changes a root param:
        </p>
        <Link href={`/${otherRootParam}`}>/{otherRootParam}</Link>
      </p>
      <p>
        <p>
          This link <em>should</em> trigger an MPA navigation, because in
          addition to changing a root param, it also navigates to a different
          root layout:
        </p>
        <Link href={`/${otherRootParam}/inner`}>/{otherRootParam}/inner</Link>
      </p>
    </>
  )
}
