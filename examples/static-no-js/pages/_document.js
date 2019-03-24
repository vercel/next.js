import Document, { Html, Main } from 'next/document'

class MyDocument extends Document {
  static async getInitialProps (ctx) {
    const initialProps = await Document.getInitialProps(ctx)
    return { ...initialProps }
  }

  render () {
    return (
      <Html>
        <head>
          {this.props.head}
          <style>{`body { margin: 0 }`}</style>
          {this.props.styles}
        </head>
        <body>
          <Main />
        </body>
      </Html>
    )
  }
}

export default MyDocument
