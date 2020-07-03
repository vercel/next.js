import Document, {
  Head,
  Html,
  Main,
  NextScript,
} from '../integration/font-optimization/server/pages/next/document'
import React from 'react'

class WeddingDocument extends Document {
  render() {
    return (
      <Html lang="en-GB">
        <Head />
        <Main />
        <NextScript />
      </Html>
    )
  }
}

export default WeddingDocument
