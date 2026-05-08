type WorkspaceActivityProps = {
  params: Promise<{
    channel: string
    thread: string
  }>
}

export default async function WorkspaceActivity({
  params,
}: WorkspaceActivityProps) {
  const { channel, thread } = await params

  return (
    <p id="workspace-activity-page">
      workspace activity: {channel}/{thread}
    </p>
  )
}

export function generateStaticParams({
  params,
}: {
  params: { workspace: string }
}) {
  return params.workspace === 'acme'
    ? [
        {
          channel: 'general',
          thread: '123',
        },
      ]
    : []
}
