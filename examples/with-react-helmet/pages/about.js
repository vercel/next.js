import React from 'react'
import Helmet from 'react-helmet'

export default function About () {
  return (
    <div>
      <Helmet
        title='About | Hello next.js!'
        meta={[{ property: 'og:title', content: 'About' }]}
      />
      About the World
    </div>
  )
}
