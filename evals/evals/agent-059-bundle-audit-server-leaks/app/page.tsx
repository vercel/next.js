import { ChatPanel } from '@/components/chat-panel'
import { DocsSearch } from '@/components/docs-search'
import { SetupChecklist } from '@/components/setup-checklist'
import { WelcomeTour } from '@/components/welcome-tour'

export default function HomePage() {
  return (
    <main>
      <h1>Acme Help Center</h1>
      <WelcomeTour />
      <SetupChecklist />
      <DocsSearch />
      <ChatPanel />
    </main>
  )
}
