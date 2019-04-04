import Document, { Html, Head, Main, NextScript } from 'next/document'
import { PersistGate } from 'redux-persist/integration/react'

class MyDocument extends Document {
  static async getInitialProps (ctx) {
    const originalRenderPage = ctx.renderPage

    ctx.renderPage = () =>
      originalRenderPage({
        // useful for wrapping the whole react tree
        enhanceApp: App => App,
        // useful for wrapping in a per-page basis
        enhanceComponent: Component => {
          const WrappedComponent = (props) => {
            const { persistor } = props
            return <PersistGate loading={null} persistor={persistor}><Component {...props} /></PersistGate>
          }
          return WrappedComponent
        }
      })

    // Run the parent `getInitialProps` using `ctx` that now includes our custom `renderPage`
    const initialProps = await Document.getInitialProps(ctx)

    return initialProps
  }

  render () {
    return (
      <Html>
        <Head>
          <style>{`body { margin: 0 } /* custom! */`}</style>
        </Head>
        <body className='custom_class'>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}

export default MyDocument
