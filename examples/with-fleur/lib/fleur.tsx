import { AppContext as FleurAppContext } from '@fleur/fleur'
import { deserializeContext, NextJsOps } from '@fleur/next'
import { useRef, useEffect } from 'react'
import { createContext } from '../domains'

const FLEUR_CONTEXT_KEY = '__FLEUR_CONTEXT__'

// Keep context static without expose to global(likes window)
const clientStatic = {}

/** Get static object only client side, otherwise always returns new object */
const getSafeClientStatic = () => {
  const isServer = typeof window === 'undefined'
  if (!isServer) return clientStatic
  return {} as any
}

export const getOrCreateFleurContext = (state: any = null): FleurAppContext => {
  const clientStatic = getSafeClientStatic()

  if (clientStatic[FLEUR_CONTEXT_KEY]) {
    return clientStatic[FLEUR_CONTEXT_KEY]
  }

  const context = createContext()
  if (state) context.rehydrate(state)
  clientStatic[FLEUR_CONTEXT_KEY] = context

  return context
}

/** Rehydrate serverSideProps to Stores */
export const useFleurRehydration = (
  context: FleurAppContext,
  state: string | null
) => {
  const isFirstRendering = useRef<boolean>(true)

  useEffect(() => {
    if (isFirstRendering.current) return
    if (state == null) return

    // Rehydrate serverSideProps on client side page transition
    context.executeOperation(
      NextJsOps.rehydrateServerSideProps,
      deserializeContext(state)
    )
  }, [context, state])

  isFirstRendering.current = false
}
