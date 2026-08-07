import { ReactNode } from 'react'
import { RelativeHrefs } from '../../relative-hrefs'
import { ChatNavLinks } from './nav-links'

export default function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <RelativeHrefs
        id="chat-layout-hrefs"
        targets={['/chat', '/chat/[id]', '/', '/pricing']}
      />
      <ChatNavLinks />
      {children}
    </div>
  )
}
