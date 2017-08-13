import React from 'react'
import ReactDOMServer from 'react-dom/lib/ReactDOMServer'

export default function Noscript (props) {
  const staticMarkup = ReactDOMServer.renderToStaticMarkup(props.children)
  return <noscript dangerouslySetInnerHTML={{ __html: staticMarkup }} />
}
