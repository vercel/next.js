export default async function TeamSettingsPage(props: {
  params: Promise<{ orgId: string; teamId: string }>
}) {
  const params = await props.params
  return (
    <div id="settings-page">
      Settings for Team {params.teamId} in Org {params.orgId}
    </div>
  )
}
