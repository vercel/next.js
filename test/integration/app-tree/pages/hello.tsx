import React from 'react'
import { render } from 'react-dom'
import { renderToString } from 'react-dom/server'

const Page = ({ html }) =>
  html ? (
    <>
      <p>saved:</p>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </>
  ) : (
    <p>Hello world</p>
  )

Page.getInitialProps = async ({ AppTree }) => {
  let html
  const toRender = <AppTree />

  if (typeof window !== 'undefined') {
    const el = document.createElement('div')
    document.querySelector('body').appendChild(el)
    render(toRender, el)
    html = el.innerHTML
    el.remove()
  } else {
    html = renderToString(toRender)
  }

  return { html }
}

export default Page
