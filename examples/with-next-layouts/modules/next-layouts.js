import React from 'react'
const defaultOptions = {
  getInitialPropsMode: 'sequential'
}

export default function applyLayout (PageComponent, options) {
  options = Object.assign({}, defaultOptions, options)

  if (!isFunction(PageComponent.layout)) {
    warn('Missing static property "layout" of page component.')
    return PageComponent
  }

  if (isFunction(PageComponent.renderPage)) {
    warn('You should not define static property "renderPage" of page component when the layout is applying')
    return PageComponent
  }

  // collect layouts & getInitialProps
  let layouts = [PageComponent.layout]
  while (isFunction(layouts[0].parentLayout)) {
    layouts.unshift(layouts[0].parentLayout)
  }
  const layoutGetInitialPropsList = layouts.map(Layout => isFunction(Layout.getInitialProps) ? Layout.getInitialProps : () => ({}))
  const pageGetInitialProps = isFunction(PageComponent.getInitialProps) ? PageComponent.getInitialProps : () => ({})

  PageComponent.getInitialProps = async(ctx) => {
    let layoutPropsList = []
    let pageProps

    if (options.getInitialPropsMode === 'sequential') {
      for (const layoutGetInitialProps of layoutGetInitialPropsList) {
        const layoutProps = await layoutGetInitialProps(ctx)
        layoutPropsList.push(layoutProps)
      }
      pageProps = await pageGetInitialProps(ctx)
    } else if (options.getInitialPropsMode === 'concurrent') {
      const promises = layoutGetInitialPropsList.map(layoutGetInitialProps => layoutGetInitialProps(ctx))
      promises.push(pageGetInitialProps(ctx))
      const promiseResults = await Promise.all(promises)
      pageProps = promiseResults.pop()
      layoutPropsList = promiseResults
    }

    return { layoutPropsList, pageProps }
  }

  PageComponent.renderPage = ({ Component, props: { layoutPropsList, pageProps }, url }) => {
    return renderLayout({ Component, layouts, pageProps, layoutPropsList, url })
  }

  return PageComponent
}

function renderLayout ({ Component, layouts, pageProps, layoutPropsList, url }) {
  const Layout = layouts[0]
  const layoutProps = layoutPropsList[0]
  return (Layout) ? (
    <Layout {...layoutProps} pageProps={pageProps} url={url}>
      {renderLayout({
        Component,
        layouts: layouts.slice(1, layouts.length),
        pageProps,
        layoutPropsList: layoutPropsList.slice(1, layoutPropsList.length),
        url
      })}
    </Layout>
  ) : (
    <Component {...pageProps} url={url} />
  )
}

function isFunction (func) {
  return typeof func === 'function'
}

function warn (message) {
  if (process.env.NODE_ENV !== 'production') {
    console.error(message)
  }
}
