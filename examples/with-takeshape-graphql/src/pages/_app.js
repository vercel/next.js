import Header from '../components/header'
import Footer from '../components/footer'
import '../base.css'

export default function MyApp({ Component, pageProps }) {
  return (
    <>
      <Header />
      <Component {...pageProps} />
      <Footer />
    </>
  )
}
