export default async function TeamSettingsModal(props: {
  params: Promise<{ orgId: string; teamId: string }>
}) {
  const params = await props.params
  return (
    <div id="settings-modal">
      Modal: Settings for Team {params.teamId} in Org {params.orgId}
    </div>
  )
}
