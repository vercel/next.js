import { Children } from 'react'
import NextDocument, { Html, Head, Main, NextScript } from 'next/document'
import { AppRegistry } from 'react-native'
import config from '../../app.json'

// Force Next-generated DOM elements to fill their parent's height
const normalizeNextElements = `
  #__next {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
`

export default class MyDocument extends NextDocument {
  static async getInitialProps({ renderPage }) {
    AppRegistry.registerComponent(config.name, () => Main)
    // @ts-ignore
    const { getStyleElement } = AppRegistry.getApplication(config.name)
    const page = await renderPage()
    const styles = [
      <style dangerouslySetInnerHTML={{ __html: normalizeNextElements }} />,
      getStyleElement(),
    ]
    return { ...page, styles: Children.toArray(styles) }
  }

  render() {
    return (
      <Html style={{ height: '100%' }}>
        <Head />
        <body style={{ height: '100%', overflow: 'hidden' }}>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}
