import { AppContext as FleurAppContext } from '@fleur/fleur'
import {
  bindFleurContext,
  deserializeContext,
  FleurishNextAppContext,
  NextJsOps,
} from '@fleur/next'
import { FleurContext } from '@fleur/react'
import { AppInitialProps, AppProps, AppContext } from 'next/app'
import { useMemo } from 'react'
import { useRef, useEffect } from 'react'
import { createContext } from '../domains'

const FLEUR_CONTEXT_KEY = '__FLEUR_CONTEXT__'

export type FleurSSProps = {
  __FLEUR_STATE__: string
}

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

export interface FleurishFunctionApp<P = {}> {
  (props: AppProps & P): JSX.Element
  getInitialProps?(
    appContext: FleurishNextAppContext
  ): Promise<Record<string, any> & Partial<AppInitialProps>>
}

export function appWithFleur<P>(App: FleurishFunctionApp<P>) {
  const FleurishApp = ({ __FLEUR_STATE__, ...props }: any) => {
    const fleurContext = useMemo(
      () => getOrCreateFleurContext(deserializeContext(__FLEUR_STATE__)),
      [__FLEUR_STATE__]
    )

    useFleurRehydration(fleurContext, __FLEUR_STATE__)

    return (
      <FleurContext value={fleurContext}>
        <App {...props} />
      </FleurContext>
    )
  }

  if (App.getInitialProps) {
    FleurishApp.getInitialProps = async (
      nextAppContext: AppContext
    ): Promise<AppInitialProps> => {
      const fleurContext = getOrCreateFleurContext()
      const fleurishAppContext = bindFleurContext(fleurContext, nextAppContext)

      const appProps = await App.getInitialProps?.(fleurishAppContext)
      const pageProps = await fleurishAppContext.Component.getInitialProps?.(
        fleurishAppContext.ctx
      )

      return {
        ...appProps,
        pageProps: pageProps,
      }
    }
  }

  return FleurishApp
}

/** Rehydrate serverSideProps to Stores */
const useFleurRehydration = (
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
