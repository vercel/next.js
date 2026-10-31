import React from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { NextPage } from 'next'

const Page: NextPage<{ html: string }> = ({ html }) =>
  html ? (
    <>
      <p>saved:</p>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </>
  ) : (
    <p>Hello world</p>
  )

Page.getInitialProps = async ({ AppTree }) => {
  let html: string

  const toRender = <AppTree pageProps={{}} />

  if (typeof window !== 'undefined') {
    const el = document.createElement('div')
    document.querySelector('body')?.appendChild(el)
    flushSync(() => {
      createRoot(el).render(toRender)
    })
    html = el.innerHTML
    el.remove()
  } else {
    html = renderToString(toRender)
  }

  return { html }
}

export default Page
