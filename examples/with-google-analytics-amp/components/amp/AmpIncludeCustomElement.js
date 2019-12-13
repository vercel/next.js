import React from 'react'
import Head from 'next/head'

export default props => (
  <Head>
    <script
      async
      custom-element={props.name}
      src={
        'https://cdn.ampproject.org/v0/' +
        props.name +
        '-' +
        props.version +
        '.js'
      }
      key={props.name}
    />
  </Head>
)
