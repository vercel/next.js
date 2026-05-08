import type { Metadata } from 'next'
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

export async function generateMetadata({
  params,
}: WorkspaceThreadPageProps): Promise<Metadata> {
  const { channel, thread, workspace } = await params

  return {
    title: `Workspace ${workspace} thread ${channel}/${thread}`,
    description: `Offline workspace thread ${workspace}/${channel}/${thread}`,
  }
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
