import Link from 'next/link'

export default async function Page(props: {
  params: Promise<{ foo_id: string; bar_id: string }>
}) {
  const params = await props.params
  return (
    <>
      <h1>
        foo id {params.foo_id}, bar id {params.bar_id}
      </h1>
      <Link href="/baz_id/1">Link to bug report 1</Link>
    </>
  )
}
