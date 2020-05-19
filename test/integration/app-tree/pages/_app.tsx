import React from 'react'
import Link from 'next/link'
import { render } from 'react-dom'
import App, { AppContext } from 'next/app'
import { renderToString } from 'react-dom/server'

class MyApp<P = {}> extends App<P & { html: string }> {
  static async getInitialProps({ Component, AppTree, ctx }: AppContext) {
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

  render() {
    const { Component, pageProps, html, router } = this.props
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
}

export default MyApp
