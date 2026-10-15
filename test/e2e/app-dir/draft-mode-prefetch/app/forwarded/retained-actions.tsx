'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { LinkAccordion } from '../link-accordion'

type RetainedActions = {
  enable: () => Promise<void>
  disable: () => Promise<void>
  enableAndRedirect: () => Promise<void>
}

const RetainedActionsContext = createContext<{
  actions: RetainedActions | null
  setActions: (actions: RetainedActions) => void
} | null>(null)

export function RetainedActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<RetainedActions | null>(null)

  return (
    <RetainedActionsContext.Provider value={{ actions, setActions }}>
      {children}
    </RetainedActionsContext.Provider>
  )
}

export function RegisterActions({ actions }: { actions: RetainedActions }) {
  const context = useContext(RetainedActionsContext)
  if (context === null) {
    throw new Error('RegisterActions requires RetainedActionsProvider')
  }
  const { setActions } = context

  useEffect(() => {
    // Keep the action references after the source page unmounts.
    setActions(actions)
  }, [actions, setActions])

  return context.actions === null ? null : (
    <p id="forwarded-actions-ready">Forwarded actions registered</p>
  )
}

export function RetainedActionControls() {
  const context = useContext(RetainedActionsContext)
  if (context === null) {
    throw new Error('RetainedActionControls requires RetainedActionsProvider')
  }
  const { actions } = context
  if (actions === null) {
    return <p>Visit the source page to register its actions.</p>
  }

  return (
    <>
      <div>
        <LinkAccordion href="/article/forwarded-retained" prefetch={true}>
          Forwarded retained target
        </LinkAccordion>
      </div>
      <form action={actions.enable}>
        <button id="forwarded-enable-draft-mode">Enable draft mode</button>
      </form>
      <form action={actions.disable}>
        <button id="forwarded-disable-draft-mode">Disable draft mode</button>
      </form>
      <form action={actions.enableAndRedirect}>
        <button id="forwarded-enable-and-redirect">
          Enable draft mode and redirect
        </button>
      </form>
    </>
  )
}
