const CustomApp = ({ Component, pageProps }) => <Component {...pageProps} />

//  Disable static optimization to always server render, making nonce unique on every request
CustomApp.getInitialProps = () => ({})

export default CustomApp
