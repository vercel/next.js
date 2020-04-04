import React from 'react'
import { Provider } from 'mobx-react'
import { getSnapshot } from 'mobx-state-tree'
import { store } from '../stores/store'

const MyApp = ({ Component, pageProps }) => {
  return (
    <Provider store={getSnapshot(store)}>
      <Component {...pageProps} />
    </Provider>
  )
}

export default MyApp
