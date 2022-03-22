import '../global.css'
import Layout from '../components/layout'

export default function MyApp({ Component, pageProps }) {
  // Use the layout defined at the page level, if available
  const getLayout = Component.getLayout || ((page) => Layout(page))

  return getLayout(<Component {...pageProps} />)
}
