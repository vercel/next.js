'use client'

/* Core */
import { Provider } from 'react-redux'

/* Instruments */
import { reduxStore } from '@/lib/redux'

export const Providers = (props: React.PropsWithChildren) => {
  // @ts-expect-error reason: react-redux and next.js type mismatch https://github.com/vercel/next.js/issues/37421
  return <Provider store={reduxStore}>{props.children}</Provider>
}
