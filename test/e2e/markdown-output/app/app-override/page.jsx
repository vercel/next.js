import { ActionButton } from './action-button'
import { InteractiveCard } from './interactive-card'

export const markdown = {
  components: {
    button({ children }) {
      return `tag:${children}`
    },
    ActionButton() {
      return 'component:Download'
    },
    InteractiveCard() {
      return 'action:Card'
    },
  },
}
export const dynamic = 'force-dynamic'

export default function AppOverridePage() {
  return (
    <main>
      <InteractiveCard />
      <ActionButton />
      <p>Override paragraph</p>
    </main>
  )
}
