const App = ({ Component, pageProps }) => <Component {...pageProps} />

App.getInitialProps = () => ({
  pageProps: {
    hello: 'world',
  },
})

export default App
