function SSRPage({ test }) {
  return <h1>{test}</h1>
}

SSRPage.getInitialProps = () => {
  return {
    test: 'hello',
  }
}

export default SSRPage
