'use client'

import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'

type Action = () => Promise<string>

const ActionContext = createContext<{
  action: Action | null
  setAction: Dispatch<SetStateAction<Action | null>>
} | null>(null)

export function ActionProvider({ children }: { children: ReactNode }) {
  const [action, setAction] = useState<Action | null>(null)

  return (
    <ActionContext.Provider value={{ action, setAction }}>
      {children}
    </ActionContext.Provider>
  )
}

export function useActionReference() {
  const context = useContext(ActionContext)
  if (!context) {
    throw new Error('Missing action provider')
  }
  return context
}
