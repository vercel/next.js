import React from 'react'
import { prefix } from 'goober-autoprefixer'
import { setup } from 'goober'

// goober's needs to know how to render the `styled` nodes.
// So to let it know, we run the `setup` function with the
// `createElement` function and prefixer function.
setup(React.createElement, prefix)

export default function App({ Component, pageProps }) {
  return <Component {...pageProps} />
}
