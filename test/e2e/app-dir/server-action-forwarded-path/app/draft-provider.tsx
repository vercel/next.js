'use client'

import { createContext, useCallback, useState, useTransition } from 'react'
import type { ReactNode } from 'react'

type DraftAction = () => Promise<string>

export const RegisterDraft = createContext<
  ((action: DraftAction) => void) | null
>(null)

export function DraftProvider({ children }: { children: ReactNode }) {
  const [action, setAction] = useState<DraftAction | null>(null)
  const [result, setResult] = useState('')
  const [pending, startTransition] = useTransition()
  const register = useCallback((nextAction: DraftAction) => {
    setAction(() => nextAction)
  }, [])

  return (
    <RegisterDraft.Provider value={register}>
      {children}
      <button
        id="save-draft"
        disabled={!action || pending}
        onClick={() => {
          startTransition(async () => {
            if (action) {
              try {
                setResult(await action())
              } catch (error) {
                setResult(error instanceof Error ? error.message : 'Failed')
              }
            }
          })
        }}
      >
        Save stored draft
      </button>
      <output id="result">{result}</output>
    </RegisterDraft.Provider>
  )
}
