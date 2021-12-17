import { StyleRegistry } from 'styled-jsx'

const CustomApp = ({ Component, pageProps }) => (
  <StyleRegistry>
    <Component {...pageProps} />
  </StyleRegistry>
)

//  Disable static optimization to always server render, making nonce unique on every request
CustomApp.getInitialProps = () => ({})

export default CustomApp
