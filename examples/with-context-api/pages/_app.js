import App, { Container } from 'next/app'
/* First we import our provider */
import NoteProvider from '../components/CounterProvider'

class MyApp extends App {
  render () {
    const { Component, pageProps } = this.props
    return (
      <Container>
        {/* Then we wrap our components with the provider */}
        <NoteProvider>
          <Component {...pageProps} />
        </NoteProvider>
      </Container>
    )
  }
}

export default MyApp
