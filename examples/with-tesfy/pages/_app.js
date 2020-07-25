import React from 'react'
import { TesfyProvider, createInstance } from 'react-tesfy'
import Nav from '../components/nav'

const App = ({ Component, pageProps }) => {
  const { datafile = {}, userId } = pageProps
  const engine = createInstance({
    datafile,
    userId,
  })

  return (
    <TesfyProvider engine={engine}>
      <Nav />
      <main>
        <p>
          Your user identifier is <b>{engine.getUserId()}</b>. Delete{' '}
          <b>user_id</b> cookie and refresh to get a new one
        </p>
        <Component {...pageProps} />
      </main>
    </TesfyProvider>
  )
}

export default App
