const IndexPage = () => <div>Hello World</div>

// Opt into SSR manually since we need
// to generate a nonce on every request
IndexPage.getInitialProps = () => ({
  preventWarning: true,
})

export default IndexPage
