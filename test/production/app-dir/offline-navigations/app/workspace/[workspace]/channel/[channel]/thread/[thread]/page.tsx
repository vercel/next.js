import { OfflineStatus } from '../../../../../../offline-status'

type WorkspaceThreadPageProps = {
  params: Promise<{
    channel: string
    thread: string
    workspace: string
  }>
}

export default async function WorkspaceThreadPage({
  params,
}: WorkspaceThreadPageProps) {
  const { channel, thread, workspace } = await params

  return (
    <>
      <p id="workspace-thread-page">
        workspace thread: {workspace}/{channel}/{thread}
      </p>
      <OfflineStatus />
    </>
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
