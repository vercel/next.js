'use client'

import Link from 'next/link'
import { unstable_useRelativeHref } from 'next/navigation'

export function ChatNavLinks() {
  // '/chat' is an ancestor of every page below this layout, so the result is
  // pure traversal ('./' on /chat/[id], '../' on /chat/[id]/settings) and the
  // appended child segment always resolves to /chat/456.
  const chatHref = unstable_useRelativeHref('/chat')
  // '/chat/[id]' is the layout's own route; appending a child segment
  // resolves to a child of the current chat.
  const chatIdHref = unstable_useRelativeHref('/chat/[id]')
  return (
    <div>
      <Link id="link-to-chat-456" href={`${chatHref}456`}>
        Go to chat 456
      </Link>
      <Link id="link-to-current-chat-settings" href={`${chatIdHref}settings`}>
        Go to settings of current chat
      </Link>
    </div>
  )
}
