import React from 'react'
import Link from 'next/link'
import { render } from 'react-dom'
import { AppContext, AppType } from 'next/app'
import { renderToString } from 'react-dom/server'

const MyApp: AppType<{}, { html: string }> = ({
  Component,
  pageProps,
  html,
  router,
}) => {
  const href = router.pathname === '/' ? '/another' : '/'

  return html && router.pathname !== '/hello' ? (
    <>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <Link href={href}>
        <a id={href === '/' ? 'home' : 'another'}>to {href}</a>
      </Link>
    </>
  ) : (
    <Component {...pageProps} />
  )
}

MyApp.getInitialProps = async ({ Component, AppTree, ctx }: AppContext) => {
  let pageProps = {}

  if (Component.getInitialProps) {
    pageProps = await Component.getInitialProps(ctx)
  }

  let html: string
  const toRender = <AppTree pageProps={pageProps} another="prop" />

  if (typeof window !== 'undefined') {
    const el = document.createElement('div')
    document.querySelector('body').appendChild(el)
    render(toRender, el)
    html = el.innerHTML
    el.remove()
  } else {
    html = renderToString(toRender)
  }

  return { pageProps, html }
}

export default MyApp
