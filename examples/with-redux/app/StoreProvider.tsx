'use client'
import type { AppStore } from '@/lib/store'
import { makeStore } from '@/lib/store'
import type { ReactNode } from 'react'
import { useRef } from 'react'
import { Provider } from 'react-redux'

interface Props {
  children: ReactNode
}

export const StoreProvider = ({ children }: Props) => {
  const storeRef = useRef<AppStore | null>(null)
  if (!storeRef.current) {
    // Create the store instance the first time this renders
    storeRef.current = makeStore()
  }

  return <Provider store={storeRef.current}>{children}</Provider>
}
