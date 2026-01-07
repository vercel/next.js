import Link from 'next/link'

export default async function GroupPage(props: {
  params: Promise<{ id: string }>
}) {
  const params = await props.params
  return (
    <div>
      <div id="group-page">Group {params.id}</div>
      <Link href={`/groups/${params.id}/new`} id="new-link">
        New Item
      </Link>
    </div>
  )
}
