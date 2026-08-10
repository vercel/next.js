const App = ({ Component, pageProps }) => <Component {...pageProps} />

App.getInitialProps = () => ({
  pageProps: {
    hi: 'override me',
    hello: 'world',
  },
})

export default App
