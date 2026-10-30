import { RelativeHrefs } from '../../relative-hrefs'

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <>
      <div id="chat-page-id">{id}</div>
      <RelativeHrefs
        id="chat-page-hrefs"
        targets={[
          '/chat',
          '/',
          '/chat/[id]',
          '/chat/[id]/settings',
          '/pricing',
          '/chat/[id]?tab=files',
          '/pricing#faq',
          '/chat/[id]/settings?tab=members#invite',
        ]}
      />
    </>
  )
}
