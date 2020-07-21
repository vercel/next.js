import React from 'react'
import Head from 'next/head'

import getConfig from 'next/config'

const {
  publicRuntimeConfig: {
    lngConfig: { languages },
  },
} = getConfig()

const defaultLanguage = languages[0]

// Just redirect to our /[lng] page somehow
const Index = () => {
  React.useEffect(() => {
    window.location.replace(`/${defaultLanguage}`)
  })

  return (
    <Head>
      <meta name="robots" content="noindex, nofollow" />
    </Head>
  )
}

export default Index
