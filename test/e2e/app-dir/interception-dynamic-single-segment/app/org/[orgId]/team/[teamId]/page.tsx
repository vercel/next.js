import Link from 'next/link'

export default async function TeamPage(props: {
  params: Promise<{ orgId: string; teamId: string }>
}) {
  const params = await props.params
  return (
    <div>
      <div id="team-page">
        Team {params.teamId} in Org {params.orgId}
      </div>
      <Link
        href={`/org/${params.orgId}/team/${params.teamId}/settings`}
        id="settings-link"
      >
        Settings
      </Link>
    </div>
  )
}
