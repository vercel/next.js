import Tina from '../.tina/components/TinaDynamicProvider.js'

import '../styles/index.css'
const App = ({ Component, pageProps }) => {
  return (
    <Tina>
      <Component {...pageProps} />
    </Tina>
  )
}

export default App
